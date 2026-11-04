package api

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"nexa-home/internal/auth"
	"nexa-home/internal/db"

	"github.com/google/uuid"
)

func TestHTTPRateLimitAndAmbiguousCookies(t *testing.T) {
	h := adminHarness(t)
	for range 5 {
		h.request("POST", "/api/v1/auth/login", map[string]string{"username": "admin", "password": "wrong password"}, 401)
	}
	w := h.request("POST", "/api/v1/auth/login", map[string]string{"username": "admin", "password": adminPassword}, 429)
	if w.Header().Get("Retry-After") != "900" {
		t.Fatal("missing lockout retry interval")
	}
	r := httptest.NewRequest("GET", origin+"/api/v1/auth/me", nil)
	r.AddCookie(h.cookie)
	r.AddCookie(h.cookie)
	w = httptest.NewRecorder()
	h.server.ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatal("duplicate session cookies accepted")
	}
	r = httptest.NewRequest("POST", origin+"/api/v1/auth/logout", nil)
	r.AddCookie(h.cookie)
	r.Header.Set("Origin", origin)
	r.Header.Add("X-CSRF-Token", h.csrf)
	r.Header.Add("X-CSRF-Token", h.csrf)
	w = httptest.NewRecorder()
	h.server.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("duplicate CSRF headers accepted")
	}
}

func TestHTTPFailuresAreSanitized(t *testing.T) {
	h := newHarness(t)
	h.server.route("GET", "/test-panic", false, func(http.ResponseWriter, *http.Request, auth.Session) error { panic("sensitive/path and secret") })
	w := h.request("GET", "/test-panic", nil, 500)
	if strings.Contains(w.Body.String(), "sensitive") || strings.Contains(h.logs.String(), "sensitive") {
		t.Fatal("panic detail exposed")
	}
	h.database.Close()
	h.request("GET", "/readyz", nil, 503)
	h.request("GET", "/api/v1/setup/status", nil, 500)
	if strings.Contains(h.logs.String(), "database is closed") {
		t.Fatal("database internals logged")
	}
}

func TestHTTPInsecureCookieRequiresExplicitOptIn(t *testing.T) {
	h := adminHarness(t)
	r := httptest.NewRequest("GET", "http://nas:8080/", nil)
	w := httptest.NewRecorder()
	h.server.cookie(w, r, "test-value")
	if !w.Result().Cookies()[0].Secure {
		t.Fatal("HTTP request silently disabled secure cookie")
	}
	h.server.config.PublicOrigin = "http://nas:8080"
	h.server.config.AllowHTTPCookie = true
	w = httptest.NewRecorder()
	h.server.cookie(w, r, "test-value")
	if w.Result().Cookies()[0].Secure {
		t.Fatal("isolated LAN opt-in ignored")
	}
	h.server.config.PublicOrigin = "https://home.example.test"
	w = httptest.NewRecorder()
	h.server.cookie(w, r, "test-value")
	if !w.Result().Cookies()[0].Secure {
		t.Fatal("HTTPS proxy origin must retain secure cookie")
	}
}

func TestStoredLinksNeverTriggerRequests(t *testing.T) {
	var calls atomic.Int64
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.WriteHeader(204) }))
	defer target.Close()
	h := adminHarness(t)
	input := serviceInput("Local link only")
	input.Links[0].URL = target.URL + "/favicon.ico"
	created := h.service(input)
	h.request("GET", "/api/v1/admin/services/"+created.ID, nil, 200)
	h.request("GET", "/api/v1/public/bootstrap", nil, 200)
	<-time.After(20 * time.Millisecond)
	if calls.Load() != 0 {
		t.Fatal("stored link was fetched by the server")
	}
}

func TestServiceCapacityLimit(t *testing.T) {
	h := adminHarness(t)
	ctx := context.Background()
	err := h.server.withTx(ctx, func(tx *sql.Tx) error {
		service, err := tx.PrepareContext(ctx, `INSERT INTO services(id,name,icon_kind,created_at,updated_at) VALUES(?,'Fixture','lucide',?,?)`)
		if err != nil {
			return err
		}
		defer service.Close()
		link, err := tx.PrepareContext(ctx, `INSERT INTO service_links(id,service_id,label,url) VALUES(?,?,'primary','http://nas.local')`)
		if err != nil {
			return err
		}
		defer link.Close()
		stamp := db.Timestamp(time.Now())
		for range MaxServices {
			id := uuid.NewString()
			if _, err := service.ExecContext(ctx, id, stamp, stamp); err != nil {
				return err
			}
			if _, err := link.ExecContext(ctx, uuid.NewString(), id); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	w := h.request("POST", "/api/v1/admin/services", serviceInput("Over limit"), 409)
	if !strings.Contains(w.Body.String(), "LIMIT_EXCEEDED") {
		t.Fatal(w.Body.String())
	}
	var count int
	if err := h.database.QueryRow("SELECT COUNT(*) FROM services").Scan(&count); err != nil || count != MaxServices {
		t.Fatalf("capacity changed: %d %v", count, err)
	}
}
