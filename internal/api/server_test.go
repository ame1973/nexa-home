package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"nexa-home/internal/config"
	"nexa-home/internal/db"
)

const adminPassword = "a strong integration password"
const origin = "https://home.example.test"

type lockedBuffer struct {
	mu     sync.Mutex
	buffer bytes.Buffer
}

func (b *lockedBuffer) Write(value []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buffer.Write(value)
}
func (b *lockedBuffer) String() string { b.mu.Lock(); defer b.mu.Unlock(); return b.buffer.String() }

type harness struct {
	t          *testing.T
	server     *Server
	database   *sql.DB
	setupToken string
	cookie     *http.Cookie
	csrf       string
	logs       *lockedBuffer
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	directory := t.TempDir()
	database, err := db.Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	logs := &lockedBuffer{}
	server, token, err := New(context.Background(), config.Config{PublicOrigin: origin, DataDir: directory}, database, slog.New(slog.NewJSONHandler(logs, nil)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { server.Close() })
	return &harness{t: t, server: server, database: database, setupToken: token, logs: logs}
}

func (h *harness) request(method, path string, input any, expected int) *httptest.ResponseRecorder {
	h.t.Helper()
	var body []byte
	if input != nil {
		var err error
		body, err = json.Marshal(input)
		if err != nil {
			h.t.Fatal(err)
		}
	}
	r := httptest.NewRequest(method, origin+path, bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", origin)
	if h.cookie != nil {
		r.AddCookie(h.cookie)
	}
	if h.csrf != "" {
		r.Header.Set("X-CSRF-Token", h.csrf)
	}
	w := httptest.NewRecorder()
	h.server.ServeHTTP(w, r)
	if w.Code != expected {
		h.t.Fatalf("%s %s: want %d, got %d: %s", method, path, expected, w.Code, w.Body.String())
	}
	definitionPath := path
	if parsed, err := url.Parse(path); err == nil {
		definitionPath = parsed.Path
	}
	matchedPath := ""
	for _, op := range h.server.contract.Operations() {
		if op.Method != method {
			continue
		}
		if op.Path == definitionPath {
			matchedPath = op.Path
			break
		}
		if strings.HasSuffix(op.Path, "/{id}") && strings.HasPrefix(definitionPath, strings.TrimSuffix(op.Path, "{id}")) {
			matchedPath = op.Path
		}
	}
	if matchedPath != "" {
		if err := h.server.contract.ValidateResponse(method, matchedPath, w.Code, w.Body.Bytes()); err != nil {
			h.t.Fatalf("contract drift: %v; %s", err, w.Body.String())
		}
	}
	if w.Header().Get("X-Request-ID") == "" {
		h.t.Fatal("missing request ID")
	}
	return w
}

func readResponse[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var value T
	if err := json.Unmarshal(w.Body.Bytes(), &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func (h *harness) initialize() {
	h.t.Helper()
	h.request("POST", "/api/v1/setup", map[string]string{"token": h.setupToken, "username": "admin", "password": adminPassword}, 201)
}
func (h *harness) login() {
	h.t.Helper()
	w := h.request("POST", "/api/v1/auth/login", map[string]string{"username": "admin", "password": adminPassword}, 200)
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		h.t.Fatal("missing session cookie")
	}
	h.cookie = cookies[0]
	h.csrf = readResponse[map[string]string](h.t, w)["csrfToken"]
}
func adminHarness(t *testing.T) *harness { h := newHarness(t); h.initialize(); h.login(); return h }

func TestHTTPAuthAndCSRF(t *testing.T) {
	h := newHarness(t)
	h.request("GET", "/healthz", nil, 200)
	h.request("GET", "/readyz", nil, 200)
	status := readResponse[map[string]bool](t, h.request("GET", "/api/v1/setup/status", nil, 200))
	if status["initialized"] {
		t.Fatal("initialized before setup")
	}
	h.request("GET", "/api/v1/auth/me", nil, 401)
	h.request("POST", "/api/v1/setup", map[string]string{"token": strings.Repeat("x", 43), "username": "admin", "password": adminPassword}, 403)
	h.initialize()
	h.request("POST", "/api/v1/setup", map[string]string{"token": h.setupToken, "username": "other", "password": adminPassword}, 409)
	h.request("POST", "/api/v1/auth/login", map[string]string{"username": "unknown", "password": "wrong password"}, 401)
	h.login()
	if !h.cookie.Secure || !h.cookie.HttpOnly || h.cookie.SameSite != http.SameSiteLaxMode || h.cookie.Path != "/" {
		t.Fatalf("insecure cookie: %+v", h.cookie)
	}
	if h.cookie.Value == h.csrf {
		t.Fatal("session disclosed as CSRF")
	}
	me := readResponse[map[string]string](t, h.request("GET", "/api/v1/auth/me", nil, 200))
	if me["username"] != "admin" || me["csrfToken"] != h.csrf {
		t.Fatal(me)
	}
	for _, test := range []struct{ name, csrf, requestOrigin string }{
		{"missing csrf", "", origin}, {"incorrect csrf", "wrong", origin}, {"foreign origin", h.csrf, "https://evil.example"}, {"missing origin", h.csrf, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", origin+"/api/v1/auth/logout", nil)
			r.AddCookie(h.cookie)
			if test.csrf != "" {
				r.Header.Set("X-CSRF-Token", test.csrf)
			}
			if test.requestOrigin != "" {
				r.Header.Set("Origin", test.requestOrigin)
			}
			w := httptest.NewRecorder()
			h.server.ServeHTTP(w, r)
			if w.Code != 403 {
				t.Fatalf("got %d: %s", w.Code, w.Body.String())
			}
			h.request("GET", "/api/v1/auth/me", nil, 200)
		})
	}
	w := h.request("POST", "/api/v1/auth/logout", nil, 204)
	if w.Result().Cookies()[0].MaxAge != -1 {
		t.Fatal("cookie not expired")
	}
	h.request("GET", "/api/v1/auth/me", nil, 401)
	if strings.Contains(h.logs.String(), adminPassword) || strings.Contains(h.logs.String(), h.cookie.Value) || strings.Contains(h.logs.String(), h.setupToken) || strings.Contains(h.logs.String(), h.csrf) {
		t.Fatal("secret leaked to HTTP logs")
	}
}

func TestHTTPValidationLimitsAndLogs(t *testing.T) {
	h := newHarness(t)
	for _, test := range []struct {
		name, body, contentType string
		code                    int
	}{
		{"unknown", `{"username":"admin","password":"long password","extra":true}`, "application/json", 400},
		{"duplicate", `{"username":"a","username":"b","password":"long password"}`, "application/json", 400},
		{"malformed", `{`, "application/json", 400},
		{"multiple", `{} {}`, "application/json", 400},
		{"nonjson", `username=admin`, "application/x-www-form-urlencoded", 400},
		{"oversize", `{"username":"` + strings.Repeat("x", JSONLimit) + `","password":"test"}`, "application/json", 413},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", origin+"/api/v1/auth/login?password=do-not-log-me", strings.NewReader(test.body))
			r.Header.Set("Origin", origin)
			r.Header.Set("Content-Type", test.contentType)
			r.Header.Set("X-Request-ID", "test-request-1")
			w := httptest.NewRecorder()
			h.server.ServeHTTP(w, r)
			if w.Code != test.code || w.Header().Get("X-Request-ID") != "test-request-1" {
				t.Fatalf("%d %s", w.Code, w.Body.String())
			}
			if err := h.server.contract.ValidateResponse("POST", "/api/v1/auth/login", w.Code, w.Body.Bytes()); err != nil {
				t.Fatal(err)
			}
		})
	}
	if strings.Contains(h.logs.String(), "do-not-log-me") {
		t.Fatal("query leaked into logs")
	}
	r := httptest.NewRequest("GET", origin+"/healthz", nil)
	r.Header.Set("X-Request-ID", "unsafe value")
	w := httptest.NewRecorder()
	h.server.ServeHTTP(w, r)
	if w.Header().Get("X-Request-ID") == "unsafe value" {
		t.Fatal("unsafe request ID accepted")
	}
	h.request("GET", "/api/v1/not-a-route", nil, 404)
}

func TestHTTPPasswordAndRealCookieStack(t *testing.T) {
	h := adminHarness(t)
	h.request("PUT", "/api/v1/auth/password", map[string]string{"currentPassword": adminPassword, "newPassword": "new integration password"}, 204)
	h.request("GET", "/api/v1/auth/me", nil, 401)
	server := httptest.NewTLSServer(h.server)
	defer server.Close()
	client := server.Client()
	r, err := http.NewRequest("POST", server.URL+"/api/v1/auth/login", strings.NewReader(`{"username":"admin","password":"new integration password"}`))
	if err != nil {
		t.Fatal(err)
	}
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", origin)
	response, err := client.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil || response.StatusCode != 200 || len(response.Cookies()) != 1 {
		t.Fatalf("TLS login: %d %s %v", response.StatusCode, body, err)
	}
	cookie := response.Cookies()[0]
	r, err = http.NewRequest("GET", server.URL+"/api/v1/auth/me", nil)
	if err != nil {
		t.Fatal(err)
	}
	r.AddCookie(cookie)
	response2, err := client.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	defer response2.Body.Close()
	if response2.StatusCode != 200 || response2.Header.Get("Cache-Control") != "no-store" {
		t.Fatal("real cookie request failed")
	}
}
