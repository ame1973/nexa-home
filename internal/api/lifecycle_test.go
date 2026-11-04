package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestFrontendFallbackKeepsReservedNamespacesAndPrivateLogs(t *testing.T) {
	h := newHarnessFrontend(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Pattern = "GET /{page}"
		w.Header().Set("Content-Type", "text/html")
		_, _ = io.WriteString(w, "static application")
	}))
	for _, name := range []string{"/api/missing", "/assets/missing/extra", "/healthz/extra", "/readyz/extra"} {
		w := h.request("GET", name, nil, 404)
		if strings.Contains(w.Body.String(), "static application") {
			t.Fatal("SPA shadowed API namespace", name)
		}
	}
	request := httptest.NewRequest("GET", "/admin?password=private-query", nil)
	request.Header.Set("Cookie", "private-cookie=never-log-this")
	w := httptest.NewRecorder()
	h.server.ServeHTTP(w, request)
	if w.Code != 200 || w.Body.String() != "static application" || w.Header().Get("X-Request-ID") == "" {
		t.Fatal(w.Code, w.Header(), w.Body.String())
	}
	if logs := h.logs.String(); strings.Contains(logs, "private-query") || strings.Contains(logs, "never-log-this") {
		t.Fatal("private data reached frontend logs", logs)
	}
}
func TestCloseDrainsActiveHandlersAndRejectsLateWork(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	defer unblock()
	h := newHarnessFrontend(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(entered)
		<-release
		_, _ = io.WriteString(w, "done")
	}))
	requestDone := make(chan struct{})
	go func() {
		h.server.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/", nil))
		close(requestDone)
	}()
	<-entered
	closing := make(chan struct{})
	closed := make(chan error, 1)
	go func() { close(closing); closed <- h.server.Close() }()
	<-closing
	select {
	case err := <-closed:
		t.Fatal("closed resources before active handler completed", err)
	case <-time.After(20 * time.Millisecond):
	}
	unblock()
	<-requestDone
	if err := <-closed; err != nil {
		t.Fatal(err)
	}
	if err := h.server.Close(); err != nil {
		t.Fatal("Close is not idempotent", err)
	}
	h.request("GET", "/readyz", nil, 503)
}
