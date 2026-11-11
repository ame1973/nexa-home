package api

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
)

func waitHealth(t *testing.T, h *harness, id, expected string) HealthStatus {
	t.Helper()
	deadline := time.After(8 * time.Second)
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()
	for {
		statuses := readResponse[[]HealthStatus](t, h.request("GET", "/api/v1/public/health", nil, 200))
		for _, status := range statuses {
			if status.ServiceID == id && status.Status == expected {
				return status
			}
		}
		select {
		case <-deadline:
			t.Fatalf("health status did not become %s", expected)
		case <-ticker.C:
		}
	}
}

func TestHealthMonitorOutcomesVisibilityAndNetworkBoundaries(t *testing.T) {
	var redirected, linked, unsafeHeaders atomic.Int64
	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		redirected.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer destination.Close()
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Cookie") != "" || r.Header.Get("Authorization") != "" || r.Header.Get("Referer") != "" || r.Method != http.MethodGet {
			unsafeHeaders.Add(1)
		}
		switch r.URL.Path {
		case "/ok":
			w.WriteHeader(http.StatusNoContent)
		case "/redirect":
			http.Redirect(w, r, destination.URL, http.StatusFound)
		case "/primary":
			linked.Add(1)
			w.WriteHeader(http.StatusOK)
		default:
			w.WriteHeader(http.StatusServiceUnavailable)
		}
	}))
	defer target.Close()

	h := newHarness(t)
	h.request("GET", "/api/v1/public/health", nil, 403)
	h.initialize()
	h.login()
	if h.server.health.transport.Proxy != nil || h.server.health.client.Jar != nil {
		t.Fatal("checks must not use environment proxies or a cookie jar")
	}
	input := serviceInput("Visible monitored")
	input.Links[0].URL = target.URL + "/primary"
	input.HealthCheck = &HealthCheck{URL: target.URL + "/ok", IntervalSeconds: 30}
	visible := h.service(input)
	status := waitHealth(t, h, visible.ID, "up")
	if status.CheckedAt == nil {
		t.Fatal("completed check lacks its timestamp")
	}
	redirectInput := serviceInput("Redirect")
	redirectInput.HealthCheck = &HealthCheck{URL: target.URL + "/redirect", IntervalSeconds: 30}
	redirect := h.service(redirectInput)
	waitHealth(t, h, redirect.ID, "down")
	hiddenCategory := h.category("Hidden category", false)
	hiddenInput := serviceInput("Secret in hidden category")
	hiddenInput.CategoryID = &hiddenCategory.ID
	hiddenInput.HealthCheck = &HealthCheck{URL: target.URL + "/hidden-health-secret", IntervalSeconds: 30}
	hidden := h.service(hiddenInput)
	hiddenInput = serviceInput("Invisible service")
	hiddenInput.IsVisible = false
	hiddenInput.HealthCheck = &HealthCheck{URL: target.URL + "/invisible-health-secret", IntervalSeconds: 30}
	invisible := h.service(hiddenInput)

	cookie, csrf := h.cookie, h.csrf
	h.cookie, h.csrf = nil, ""
	public := h.request("GET", "/api/v1/public/health", nil, 200)
	for _, secret := range []string{target.URL, destination.URL, hidden.ID, invisible.ID, "hidden-health-secret", "invisible-health-secret"} {
		if strings.Contains(public.Body.String(), secret) {
			t.Fatal("public health response leaked a hidden service or endpoint")
		}
	}
	bootstrap := h.request("GET", "/api/v1/public/bootstrap", nil, 200)
	if strings.Contains(bootstrap.Body.String(), "hidden-health-secret") || strings.Contains(bootstrap.Body.String(), target.URL+"/ok") {
		t.Fatal("public bootstrap exposed a health endpoint")
	}
	projected := readResponse[Bootstrap](t, bootstrap)
	if len(projected.Health) != 2 {
		t.Fatalf("expected two visible health statuses, got %d", len(projected.Health))
	}
	h.cookie, h.csrf = cookie, csrf
	settings := h.settings()
	settings.AccessMode = "private"
	h.request("PUT", "/api/v1/admin/settings", SettingsInput{SettingsFields: settings.SettingsFields, ExpectedRevision: settings.Revision}, 200)
	h.cookie, h.csrf = nil, ""
	h.request("GET", "/api/v1/public/health", nil, 401)
	h.request("GET", "/api/v1/public/bootstrap", nil, 401)
	h.cookie, h.csrf = cookie, csrf
	waitHealth(t, h, visible.ID, "up")

	changed := inputFromService(visible)
	changed.HealthCheck = &HealthCheck{URL: target.URL + "/fail", IntervalSeconds: 30}
	visible = readResponse[Service](t, h.request("PUT", "/api/v1/admin/services/"+visible.ID, changed, 200))
	waitHealth(t, h, visible.ID, "down")
	disable := serviceMap(t, inputFromService(visible))
	disable["healthCheck"] = nil
	h.request("PUT", "/api/v1/admin/services/"+visible.ID, disable, 200)
	statuses := readResponse[[]HealthStatus](t, h.request("GET", "/api/v1/public/health", nil, 200))
	for _, status := range statuses {
		if status.ServiceID == visible.ID {
			t.Fatal("disabled service remains in public health results")
		}
	}
	if redirected.Load() != 0 || linked.Load() != 0 || unsafeHeaders.Load() != 0 {
		t.Fatal("check followed a redirect, fetched a saved link, or sent browser credentials")
	}
	if strings.Contains(h.logs.String(), "hidden-health-secret") {
		t.Fatal("health endpoint leaked to logs")
	}
}

func TestHealthMonitorSchedulingAndStaleStatus(t *testing.T) {
	observed := make(chan time.Time, 4)
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observed <- time.Now()
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()
	h := newHarness(t)
	id := uuid.NewString()
	// Exercise the worker with a shortened test interval; API inputs enforce 30 seconds.
	check := HealthCheck{URL: target.URL, IntervalSeconds: 1}
	h.server.health.set(id, &check)
	var first, second time.Time
	select {
	case first = <-observed:
	case <-time.After(3 * time.Second):
		t.Fatal("initial check did not run")
	}
	select {
	case second = <-observed:
	case <-time.After(3 * time.Second):
		t.Fatal("check did not repeat")
	}
	if second.Sub(first) < 900*time.Millisecond {
		t.Fatal("check repeated before its configured interval")
	}
	h.server.health.mu.Lock()
	entry := h.server.health.services[id]
	entry.checkedAt, entry.status = time.Now().Add(-3*time.Minute), "up"
	h.server.health.mu.Unlock()
	if status := h.server.health.status(id, check); status.Status != "unknown" || status.CheckedAt == nil {
		t.Fatal("stale results must not be reported as current")
	}
	h.server.health.set(id, nil)
	if status := h.server.health.status(id, check); status.Status != "unknown" || status.CheckedAt != nil {
		t.Fatal("disabling a check retained its result")
	}
}

func TestHealthMonitorBoundsConcurrentRequestsAndCancelsOnShutdown(t *testing.T) {
	entered := make(chan struct{}, 32)
	release := make(chan struct{})
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	var current, maximum atomic.Int64
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		active := current.Add(1)
		defer current.Add(-1)
		for previous := maximum.Load(); active > previous && !maximum.CompareAndSwap(previous, active); previous = maximum.Load() {
		}
		entered <- struct{}{}
		select {
		case <-release:
		case <-r.Context().Done():
		}
	}))
	defer target.Close()
	defer unblock()
	h := newHarness(t)
	check := HealthCheck{URL: target.URL, IntervalSeconds: 30}
	for range maxConcurrentHealthChecks + 4 {
		h.server.health.set(uuid.NewString(), &check)
	}
	for range maxConcurrentHealthChecks {
		select {
		case <-entered:
		case <-time.After(5 * time.Second):
			t.Fatal("checks did not fill the concurrency limit")
		}
	}
	select {
	case <-entered:
		t.Fatal("checks exceeded the concurrency limit")
	case <-time.After(100 * time.Millisecond):
	}
	if maximum.Load() > maxConcurrentHealthChecks {
		t.Fatal("too many concurrent checks")
	}
	closed := make(chan error, 1)
	go func() { closed <- h.server.Close() }()
	select {
	case err := <-closed:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("shutdown did not cancel active and queued checks")
	}
	unblock()
}

func TestHealthMonitorTimeoutAndTLSVerification(t *testing.T) {
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer slow.Close()
	tlsTarget := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }))
	tlsTarget.Config.ErrorLog = log.New(io.Discard, "", 0)
	tlsTarget.StartTLS()
	defer tlsTarget.Close()
	h := adminHarness(t)
	input := serviceInput("Slow health endpoint")
	input.HealthCheck = &HealthCheck{URL: slow.URL, IntervalSeconds: 30}
	slowService := h.service(input)
	input.Name = "Untrusted TLS endpoint"
	input.HealthCheck = &HealthCheck{URL: tlsTarget.URL, IntervalSeconds: 30}
	tlsService := h.service(input)
	waitHealth(t, h, tlsService.ID, "down")
	waitHealth(t, h, slowService.ID, "down")
}

func TestHealthMonitorAcceptsTrustedTLS(t *testing.T) {
	target := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer target.Close()
	h := adminHarness(t)
	roots := x509.NewCertPool()
	roots.AddCert(target.Certificate())
	h.server.health.transport.TLSClientConfig = &tls.Config{RootCAs: roots}
	input := serviceInput("Trusted TLS endpoint")
	input.HealthCheck = &HealthCheck{URL: target.URL, IntervalSeconds: 30}
	service := h.service(input)
	waitHealth(t, h, service.ID, "up")
}

func TestHealthMonitorReconfigurationAndRestoreDiscardOldResults(t *testing.T) {
	blocked := make(chan struct{}, 2)
	release := make(chan struct{})
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	var pause atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if pause.Load() {
			blocked <- struct{}{}
			select {
			case <-release:
			case <-r.Context().Done():
				return
			}
		}
		if r.URL.Path == "/down" {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()
	defer unblock()
	h := adminHarness(t)
	input := serviceInput("Reconfigured")
	input.HealthCheck = &HealthCheck{URL: target.URL + "/up", IntervalSeconds: 30}
	service := h.service(input)
	waitHealth(t, h, service.ID, "up")

	pause.Store(true)
	input = inputFromService(service)
	input.HealthCheck = &HealthCheck{URL: target.URL + "/down", IntervalSeconds: 30}
	service = readResponse[Service](t, h.request("PUT", "/api/v1/admin/services/"+service.ID, input, 200))
	select {
	case <-blocked:
	case <-time.After(3 * time.Second):
		t.Fatal("updated endpoint was not checked")
	}
	status := waitHealth(t, h, service.ID, "unknown")
	if status.CheckedAt != nil {
		t.Fatal("old result remained after endpoint changed")
	}
	backup := h.export()
	h.restore(h.stage(backup), 200)
	select {
	case <-blocked:
	case <-time.After(3 * time.Second):
		t.Fatal("restored endpoint was not checked")
	}
	status = waitHealth(t, h, service.ID, "unknown")
	if status.CheckedAt != nil {
		t.Fatal("restore retained an earlier result")
	}
	unblock()
	waitHealth(t, h, service.ID, "down")
}

func TestHealthMonitorRejectsInvalidStoredTargetsBeforeAnyProbe(t *testing.T) {
	var calls atomic.Int64
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()
	h := adminHarness(t)
	input := serviceInput("Valid")
	input.HealthCheck = &HealthCheck{URL: target.URL, IntervalSeconds: 30}
	valid := h.service(input)
	waitHealth(t, h, valid.ID, "up")
	invalid := h.service(serviceInput("Invalid database fixture"))
	if err := h.server.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := h.database.Exec("INSERT INTO service_health_checks VALUES(?,?,?)", invalid.ID, "javascript:private-value", 30); err != nil {
		t.Fatal(err)
	}
	before := calls.Load()
	server, _, err := New(context.Background(), h.server.config, h.database, nil, nil)
	if err == nil {
		server.Close()
		t.Fatal("started with an invalid stored health target")
	}
	if strings.Contains(err.Error(), "private-value") || calls.Load() != before {
		t.Fatal("invalid configuration leaked or another check ran before validation completed")
	}
}

func TestHealthMonitorRestartsSavedChecksWithoutRetainingResults(t *testing.T) {
	blocked := make(chan struct{}, 1)
	release := make(chan struct{})
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	var afterRestart atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if afterRestart.Load() {
			blocked <- struct{}{}
			select {
			case <-release:
			case <-r.Context().Done():
				return
			}
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()
	defer unblock()
	h := adminHarness(t)
	input := serviceInput("Restarted")
	input.HealthCheck = &HealthCheck{URL: target.URL, IntervalSeconds: 30}
	service := h.service(input)
	waitHealth(t, h, service.ID, "up")
	if err := h.server.Close(); err != nil {
		t.Fatal(err)
	}
	afterRestart.Store(true)
	restarted, _, err := New(context.Background(), h.server.config, h.database, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { restarted.Close() })
	h.server = restarted
	select {
	case <-blocked:
	case <-time.After(3 * time.Second):
		t.Fatal("persisted check did not restart")
	}
	status := waitHealth(t, h, service.ID, "unknown")
	if status.CheckedAt != nil {
		t.Fatal("previous runtime result survived restart")
	}
	unblock()
	waitHealth(t, h, service.ID, "up")
}
