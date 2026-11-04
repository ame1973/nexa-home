package api

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"

	"nexa-home/internal/assets"
)

func TestStagedCleanupFailureIsReported(t *testing.T) {
	h := adminHarness(t)
	image, err := assets.Validate(iconPNG(t, 2))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.server.assets.Put(image); err != nil {
		t.Fatal(err)
	}
	if err := h.server.assets.Close(); err != nil {
		t.Fatal(err)
	}
	err = h.server.discardStaged(context.Background(), image.Path())
	if err == nil || !strings.Contains(h.logs.String(), "deferred staged icon cleanup") {
		t.Fatal("cleanup failure was silent", err)
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", origin+"/api/v1/admin/assets", nil)
	h.server.fail(w, r, err)
	if w.Code != 500 || strings.Contains(w.Body.String(), image.Path()) {
		t.Fatal("cleanup failure not sanitized as an operational error")
	}
}
