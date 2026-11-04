package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"nexa-home/internal/config"
	"nexa-home/internal/lifecycle"
)

type safeOutput struct {
	mu     sync.Mutex
	buffer bytes.Buffer
}

func (out *safeOutput) Write(data []byte) (int, error) {
	out.mu.Lock()
	defer out.mu.Unlock()
	return out.buffer.Write(data)
}
func (out *safeOutput) String() string {
	out.mu.Lock()
	defer out.mu.Unlock()
	return out.buffer.String()
}
func (out *safeOutput) events() []map[string]any {
	var events []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(out.String()), "\n") {
		var item map[string]any
		if json.Unmarshal([]byte(line), &item) == nil {
			events = append(events, item)
		}
	}
	return events
}
func start(t *testing.T, c config.Config) (string, *safeOutput, func()) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	out := new(safeOutput)
	logger := slog.New(slog.NewJSONHandler(out, nil))
	done := make(chan error, 1)
	go func() { done <- serve(ctx, c, logger, out) }()
	var once sync.Once
	stop := func() {
		once.Do(func() {
			cancel()
			select {
			case err := <-done:
				if err != nil {
					t.Error(err)
				}
			case <-time.After(5 * time.Second):
				t.Error("server did not stop gracefully")
			}
		})
	}
	t.Cleanup(stop)
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		for _, event := range out.events() {
			if event["msg"] == "listening" {
				return event["address"].(string), out, stop
			}
		}
		select {
		case err := <-done:
			t.Fatal("startup failed", err)
		default:
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("server did not start", out.String())
	return "", out, stop
}
func jsonRequest(t *testing.T, client *http.Client, address, method, path, csrf string, body any) map[string]any {
	t.Helper()
	var input io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		input = bytes.NewReader(encoded)
	}
	request, err := http.NewRequest(method, "http://"+address+path, input)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Origin", "http://"+address)
	request.Header.Set("Content-Type", "application/json")
	if csrf != "" {
		request.Header.Set("X-CSRF-Token", csrf)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode >= 400 {
		data, _ := io.ReadAll(response.Body)
		t.Fatalf("%s %s: %d %s", method, path, response.StatusCode, data)
	}
	var value map[string]any
	if err := json.NewDecoder(response.Body).Decode(&value); err != nil {
		t.Fatal(err)
	}
	return value
}
func TestBuiltApplicationLifecyclePersistenceAndLogs(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "data")
	c := config.Config{Listen: "127.0.0.1:0", DataDir: directory, AllowHTTPCookie: true}
	address, logs, stop := start(t, c)
	token := ""
	for _, event := range logs.events() {
		if value, ok := event["setupToken"].(string); ok {
			if token != "" {
				t.Fatal("setup token was logged more than once")
			}
			token = value
		}
	}
	if len(token) != 43 {
		t.Fatal("missing setup token")
	}
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar, Timeout: 3 * time.Second}
	response, err := client.Get("http://" + address + "/admin?password=never-log-this-query")
	if err != nil {
		t.Fatal(err)
	}
	html, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != 200 || !strings.Contains(string(html), "/static/") || !strings.Contains(response.Header.Get("Content-Security-Policy"), "'nonce-") || strings.Contains(string(html), token) {
		t.Fatal("embedded SPA or CSP missing")
	}
	jsonRequest(t, client, address, "POST", "/api/v1/setup", "", map[string]string{"token": token, "username": "owner", "password": "a unique runtime test password"})
	login := jsonRequest(t, client, address, "POST", "/api/v1/auth/login", "", map[string]string{"username": "owner", "password": "a unique runtime test password"})
	csrf := login["csrfToken"].(string)
	created := jsonRequest(t, client, address, "POST", "/api/v1/admin/categories", csrf, map[string]any{"name": "Persisted category", "description": "", "icon": "images", "isVisible": true})
	if created["id"] == nil {
		t.Fatal("missing category ID")
	}
	for _, path := range []string{"/api/missing", "/assets/missing/extra", "/readyz/extra"} {
		res, err := client.Get("http://" + address + path)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 404 || !strings.HasPrefix(res.Header.Get("Content-Type"), "application/json") {
			t.Fatal("SPA shadowed reserved API namespace", path)
		}
	}
	if err := healthcheck(context.Background(), config.Config{Listen: address}); err != nil {
		t.Fatal(err)
	}
	if acquired, err := lifecycle.Acquire(directory); err == nil {
		acquired.Close()
		t.Fatal("second writer acquired a running data directory")
	}
	if text := logs.String(); strings.Contains(text, "a unique runtime test password") || strings.Contains(text, "never-log-this-query") || strings.Contains(text, csrf) || strings.Contains(text, "Persisted category") {
		t.Fatal("private request data reached logs", text)
	}
	stop()
	output := new(bytes.Buffer)
	getenv := func(name string) string {
		if name == "NEXA_DATA_DIR" {
			return directory
		}
		return ""
	}
	if err := run(context.Background(), []string{"doctor"}, getenv, output); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), "are valid") {
		t.Fatal(output.String())
	}
	address, logs, _ = start(t, c)
	if strings.Contains(logs.String(), "setupToken") {
		t.Fatal("setup token returned after initialization")
	}
	status := jsonRequest(t, client, address, "GET", "/api/v1/setup/status", "", nil)
	if status["initialized"] != true {
		t.Fatal(status)
	}
	response, err = client.Get("http://" + address + "/api/v1/admin/categories")
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != 200 || !bytes.Contains(data, []byte("Persisted category")) {
		t.Fatal("database/session did not survive restart", response.StatusCode, string(data))
	}
}
func TestCommandsConfigurationAndOfflineDoctor(t *testing.T) {
	for _, command := range []string{"help", "--help", "-h", "version", "--version"} {
		var output bytes.Buffer
		if err := run(context.Background(), []string{command}, func(string) string { return "" }, &output); err != nil || output.Len() == 0 {
			t.Fatal(command, err)
		}
	}
	for _, args := range [][]string{{"unknown"}, {"serve", "extra"}} {
		if err := run(context.Background(), args, func(string) string { return "" }, io.Discard); err == nil {
			t.Fatal("accepted invalid command", args)
		}
	}
	if err := run(context.Background(), nil, func(key string) string {
		if key == "NEXA_LISTEN" {
			return "invalid"
		}
		return ""
	}, io.Discard); err == nil {
		t.Fatal("accepted invalid configuration")
	}
	directory := filepath.Join(t.TempDir(), "absent")
	if err := run(context.Background(), []string{"doctor"}, func(key string) string {
		if key == "NEXA_DATA_DIR" {
			return directory
		}
		return ""
	}, io.Discard); err == nil {
		t.Fatal("doctor silently initialized a nonexistent database")
	}
}
func TestSetupTokenBypassesErrorLogLevel(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	address := listener.Addr().String()
	listener.Close()
	values := map[string]string{"NEXA_LISTEN": address, "NEXA_DATA_DIR": filepath.Join(t.TempDir(), "data"), "NEXA_LOG_LEVEL": "error"}
	ctx, cancel := context.WithCancel(context.Background())
	out := new(safeOutput)
	done := make(chan error, 1)
	go func() { done <- run(ctx, nil, func(key string) string { return values[key] }, out) }()
	defer func() {
		cancel()
		select {
		case err := <-done:
			if err != nil {
				t.Error(err)
			}
		case <-time.After(5 * time.Second):
			t.Error("server did not exit")
		}
	}()
	deadline := time.Now().Add(5 * time.Second)
	for !strings.Contains(out.String(), "setupToken") && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if !strings.Contains(out.String(), "setupToken") {
		t.Fatal("error logging hid the first-run token")
	}
	client := &http.Client{Timeout: 3 * time.Second}
	response, err := client.Get("http://" + address + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	for _, event := range out.events() {
		if event["msg"] == "listening" || event["msg"] == "request" {
			t.Fatal("info logging was not filtered")
		}
		if value, ok := event["time"].(string); ok && !strings.HasSuffix(value, "Z") {
			t.Fatal("logs are not UTC", value)
		}
	}
}

func TestHealthcheckRejectsRedirectsWrongPayloadAndProxy(t *testing.T) {
	var proxyCalls int
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { proxyCalls++; w.WriteHeader(500) }))
	defer proxy.Close()
	t.Setenv("HTTP_PROXY", proxy.URL)
	for _, test := range []struct {
		status int
		body   string
		valid  bool
	}{{200, `{"status":"ready"}`, true}, {200, `{"status":"ok"}`, false}, {503, `{"status":"ready"}`, false}, {200, `not-json`, false}, {302, ``, false}} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/readyz" {
				t.Error(r.URL.Path)
			}
			w.Header().Set("Location", proxy.URL)
			w.WriteHeader(test.status)
			_, _ = io.WriteString(w, test.body)
		}))
		address := strings.TrimPrefix(server.URL, "http://")
		_, port, _ := net.SplitHostPort(address)
		err := healthcheck(context.Background(), config.Config{Listen: "0.0.0.0:" + port})
		server.Close()
		if (err == nil) != test.valid {
			t.Fatal(test, err)
		}
	}
	if proxyCalls != 0 {
		t.Fatal("healthcheck followed a redirect or environment proxy")
	}
	if err := healthcheck(context.Background(), config.Config{Listen: "invalid"}); err == nil {
		t.Fatal("invalid listen address")
	}
}
