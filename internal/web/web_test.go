package web

import (
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"
)

func fixture() fstest.MapFS {
	return fstest.MapFS{"dist/index.html": {Data: []byte(`<html><head><meta name="nexa-style-nonce" content="` + nonceMarker + `"><script src="/theme-init.js"></script></head><body>Application</body></html>`)}, "dist/internal.json": {Data: []byte("never-public")}, "dist/theme-init.js": {Data: []byte("window.themeReady=true;")}, "dist/static/app-01234567.js": {Data: []byte("export const loaded=true;")}, "dist/static/app-01234567.css": {Data: []byte("body{color:white}")}, "dist/.env": {Data: []byte("never-public")}, "dist/static/app.js.map": {Data: []byte("never-public")}}
}
func TestNoncePolicyAndSPARoutes(t *testing.T) {
	h, err := newHandler(fixture())
	if err != nil {
		t.Fatal(err)
	}
	var previous string
	for _, name := range []string{"/", "/login", "/setup", "/admin", "/admin/services/new", "/admin/services/00000000-0000-4000-8000-000000000001", "/admin/categories", "/admin/tags", "/admin/appearance", "/admin/security", "/admin/backup", "/missing-page"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", name, nil))
		expected := 200
		if name == "/missing-page" {
			expected = 404
		}
		if w.Code != expected {
			t.Fatalf("%s: %d", name, w.Code)
		}
		match := regexp.MustCompile(`content="([A-Za-z0-9+/]{43}=)"`).FindStringSubmatch(w.Body.String())
		if len(match) != 2 || match[1] == previous {
			t.Fatal("missing or reused nonce", w.Body.String())
		}
		previous = match[1]
		policy := w.Header().Get("Content-Security-Policy")
		if !strings.Contains(policy, "script-src 'self';") || !strings.Contains(policy, "'nonce-"+previous+"'") || strings.Contains(policy, "'sha256-") || strings.Contains(policy, "unsafe-eval") || strings.Contains(policy, "style-src 'self' 'unsafe-inline'") {
			t.Fatal("weakened CSP", policy)
		}
		if w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Fatal(w.Header())
		}
	}
}
func TestStaticCachingMethodsAndNoPrivateFallback(t *testing.T) {
	h, err := newHandler(fixture())
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/static/app-01234567.js", nil))
	if w.Code != 200 || !strings.Contains(w.Header().Get("Cache-Control"), "immutable") || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/javascript") {
		t.Fatal(w.Code, w.Header())
	}
	request := httptest.NewRequest("GET", "/static/app-01234567.js", nil)
	request.Header.Set("If-None-Match", w.Header().Get("ETag"))
	notModified := httptest.NewRecorder()
	h.ServeHTTP(notModified, request)
	if notModified.Code != 304 || notModified.Body.Len() != 0 {
		t.Fatal(notModified.Code)
	}
	for _, name := range []string{"/", "/static/app-01234567.js"} {
		head := httptest.NewRecorder()
		h.ServeHTTP(head, httptest.NewRequest("HEAD", name, nil))
		if head.Code != 200 || head.Body.Len() != 0 || head.Header().Get("Content-Length") == "" {
			t.Fatal("HEAD", name, head.Code, head.Header())
		}
	}
	for _, name := range []string{"/static/missing.js", "/api/v1/private", "/assets/private", "/readyz/missing", "/healthz/missing", "/static/../index.html"} {
		missing := httptest.NewRecorder()
		h.ServeHTTP(missing, httptest.NewRequest("GET", name, nil))
		if missing.Code != 404 || strings.Contains(missing.Body.String(), "Application") {
			t.Fatal("SPA leaked into reserved namespace", name)
		}
	}
	for _, name := range []string{"/.env", "/internal.json", "/static/app.js.map"} {
		hidden := httptest.NewRecorder()
		h.ServeHTTP(hidden, httptest.NewRequest("GET", name, nil))
		if hidden.Code != 404 || strings.Contains(hidden.Body.String(), "never-public") {
			t.Fatal("exposed non-public build file", name)
		}
	}
	theme := httptest.NewRecorder()
	h.ServeHTTP(theme, httptest.NewRequest("GET", "/theme-init.js", nil))
	if strings.Contains(theme.Header().Get("Cache-Control"), "immutable") {
		t.Fatal("unhashed theme script must revalidate")
	}
	method := httptest.NewRecorder()
	h.ServeHTTP(method, httptest.NewRequest("POST", "/", nil))
	if method.Code != 405 || method.Header().Get("Allow") != "GET, HEAD" {
		t.Fatal(method.Code)
	}
}
func TestRejectsIncompleteOrUntrustedBuildMetadata(t *testing.T) {
	for _, name := range []string{"html", "theme"} {
		t.Run(name, func(t *testing.T) {
			source := fixture()
			switch name {
			case "html":
				source["dist/index.html"] = &fstest.MapFile{Data: []byte("missing nonce")}
			case "theme":
				delete(source, "dist/theme-init.js")
			}
			if _, err := newHandler(source); err == nil {
				t.Fatal("accepted incomplete build")
			}
		})
	}
	if _, err := New(); err != nil {
		t.Fatal("actual compiled frontend", err)
	}
}
