package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func serviceMap(t *testing.T, input ServiceInput) map[string]any {
	t.Helper()
	data, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestHealthConfigurationLegacyUpdatesAndPublicPrivacy(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	defer target.Close()
	h := adminHarness(t)
	input := serviceInput("Monitored")
	input.HealthCheck = &HealthCheck{URL: target.URL + "/private-health-route", IntervalSeconds: 60}
	created := h.service(input)
	if !reflect.DeepEqual(created.HealthCheck, input.HealthCheck) {
		t.Fatal("health configuration was not saved")
	}
	public := h.request("GET", "/api/v1/public/bootstrap", nil, 200)
	if strings.Contains(public.Body.String(), "private-health-route") || strings.Contains(public.Body.String(), "healthCheck") {
		t.Fatal("public bootstrap exposed the health endpoint")
	}

	legacy := serviceMap(t, inputFromService(created))
	delete(legacy, "healthCheck")
	legacy["name"] = "Renamed by older client"
	updated := readResponse[Service](t, h.request("PUT", "/api/v1/admin/services/"+created.ID, legacy, 200))
	if !reflect.DeepEqual(updated.HealthCheck, created.HealthCheck) {
		t.Fatal("older client erased the health configuration")
	}
	legacy["healthCheck"] = nil
	updated = readResponse[Service](t, h.request("PUT", "/api/v1/admin/services/"+created.ID, legacy, 200))
	if updated.HealthCheck != nil {
		t.Fatal("explicit null did not disable the health check")
	}
	if strings.Contains(h.logs.String(), "private-health-route") {
		t.Fatal("health endpoint leaked into application logs")
	}
}

func TestHealthConfigurationValidationAndBackupCompatibility(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	defer target.Close()
	h := adminHarness(t)
	input := serviceInput("Monitored")
	input.HealthCheck = &HealthCheck{URL: target.URL + "/health", IntervalSeconds: 60}
	created := h.service(input)
	for _, check := range []HealthCheck{
		{URL: "javascript:alert(1)", IntervalSeconds: 60},
		{URL: "http://user:secret@127.0.0.1/health", IntervalSeconds: 60},
		{URL: target.URL + "/health#fragment", IntervalSeconds: 60},
		{URL: target.URL + "/health#", IntervalSeconds: 60},
		{URL: target.URL, IntervalSeconds: 29},
		{URL: target.URL, IntervalSeconds: 86401},
	} {
		candidate := inputFromService(created)
		candidate.HealthCheck = &check
		h.request("PUT", "/api/v1/admin/services/"+created.ID, candidate, 400)
	}
	current := readResponse[Service](t, h.request("GET", "/api/v1/admin/services/"+created.ID, nil, 200))
	if !reflect.DeepEqual(current.HealthCheck, created.HealthCheck) {
		t.Fatal("invalid update changed the saved check")
	}

	backup := h.export()
	if backup.Version != 3 || !reflect.DeepEqual(backup.Services[0].HealthCheck, created.HealthCheck) {
		t.Fatal("portable backup omitted the health configuration")
	}
	h.restore(h.stage(backup), 200)
	restored := readResponse[Service](t, h.request("GET", "/api/v1/admin/services/"+created.ID, nil, 200))
	if !reflect.DeepEqual(restored.HealthCheck, created.HealthCheck) {
		t.Fatal("restore lost the health configuration")
	}
	legacyWithCheck := cloneBackup(t, backup)
	legacyWithCheck.Version = 2
	h.request("POST", "/api/v1/admin/backup/validate", legacyWithCheck, 400)
	legacyWithCheck.Services[0].HealthCheck = nil
	h.restore(h.stage(legacyWithCheck), 200)
	restored = readResponse[Service](t, h.request("GET", "/api/v1/admin/services/"+created.ID, nil, 200))
	if restored.HealthCheck != nil {
		t.Fatal("legacy backup unexpectedly enabled monitoring")
	}
	h.request("GET", "/api/v1/auth/me", nil, 200)
}
