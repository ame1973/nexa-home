package api

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"io/fs"
	"mime/multipart"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"nexa-home/internal/assets"
)

const iconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4 L20 4 L20 20 Z" fill="#8b9fff"/></svg>`

func iconPNG(t *testing.T, size int) []byte {
	t.Helper()
	picture := image.NewNRGBA(image.Rect(0, 0, size, size))
	picture.Set(0, 0, color.NRGBA{G: 200, A: 255})
	var output bytes.Buffer
	if err := png.Encode(&output, picture); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

func (h *harness) upload(name string, data []byte, expected int, extra bool) *httptest.ResponseRecorder {
	h.t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", name)
	if err != nil {
		h.t.Fatal(err)
	}
	if _, err := part.Write(data); err != nil {
		h.t.Fatal(err)
	}
	if extra {
		if err := writer.WriteField("unexpected", "value"); err != nil {
			h.t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		h.t.Fatal(err)
	}
	r := httptest.NewRequest("POST", origin+"/api/v1/admin/assets", &body)
	r.Header.Set("Content-Type", writer.FormDataContentType())
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
		h.t.Fatalf("upload %s: want %d, got %d: %s", name, expected, w.Code, w.Body.String())
	}
	if err := h.server.contract.ValidateResponse("POST", "/api/v1/admin/assets", w.Code, w.Body.Bytes()); err != nil {
		h.t.Fatal(err)
	}
	return w
}

func assetFiles(t *testing.T, h *harness) []string {
	t.Helper()
	var files []string
	err := filepath.WalkDir(filepath.Join(h.server.config.DataDir, "assets"), func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() {
			files = append(files, name)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return files
}

func TestAssetUploadDedupeAndVisibility(t *testing.T) {
	h := adminHarness(t)
	asset := readResponse[Asset](t, h.upload("icon.png", iconPNG(t, 8), 201, false))
	duplicate := readResponse[Asset](t, h.upload("different-name.bin", iconPNG(t, 8), 201, false))
	if duplicate.ID != asset.ID || len(assetFiles(t, h)) != 1 {
		t.Fatal("identical upload not deduplicated")
	}
	w := h.request("GET", asset.URL, nil, 200)
	if w.Header().Get("Content-Type") != "image/png" || w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("Cross-Origin-Resource-Policy") != "same-origin" {
		t.Fatal("unsafe asset headers")
	}
	cookie, csrf := h.cookie, h.csrf
	h.cookie = nil
	h.csrf = ""
	h.request("GET", asset.URL, nil, 404)
	h.cookie = cookie
	h.csrf = csrf
	category := h.category("Private category", false)
	input := serviceInput("Icon service")
	input.CategoryID = &category.ID
	input.IconKind = "asset"
	input.IconAssetID = &asset.ID
	input.IconValue = "Uploaded icon"
	service := h.service(input)
	h.cookie = nil
	h.csrf = ""
	h.request("GET", asset.URL, nil, 404)
	h.cookie = cookie
	h.csrf = csrf
	category.IsVisible = true
	h.request("PUT", "/api/v1/admin/categories/"+category.ID, category.CategoryInput, 200)
	h.cookie = nil
	h.csrf = ""
	h.request("GET", asset.URL, nil, 200)
	h.cookie = cookie
	h.csrf = csrf
	h.request("DELETE", "/api/v1/admin/assets/"+asset.ID, nil, 409)
	h.request("GET", asset.URL, nil, 200)
	settings := h.settings()
	settings.AccessMode = "private"
	h.request("PUT", "/api/v1/admin/settings", SettingsInput{SettingsFields: settings.SettingsFields, ExpectedRevision: settings.Revision}, 200)
	h.cookie = nil
	h.csrf = ""
	h.request("GET", asset.URL, nil, 401)
	h.cookie = cookie
	h.csrf = csrf
	h.request("DELETE", "/api/v1/admin/services/"+service.ID, nil, 204)
	h.request("DELETE", "/api/v1/admin/assets/"+asset.ID, nil, 204)
	h.request("GET", asset.URL, nil, 404)
	if len(assetFiles(t, h)) != 0 {
		t.Fatal("deleted icon file retained")
	}
}

func TestAssetSVGAndWebP(t *testing.T) {
	h := adminHarness(t)
	asset := readResponse[Asset](t, h.upload("local-favicon.svg", []byte(iconSVG), 201, false))
	w := h.request("GET", asset.URL, nil, 200)
	if w.Header().Get("Content-Type") != "image/svg+xml" || !strings.Contains(w.Header().Get("Content-Security-Policy"), "sandbox") || strings.Contains(w.Header().Get("Content-Security-Policy"), "allow-scripts") {
		t.Fatal("SVG sandbox missing")
	}
	webp, err := base64.StdEncoding.DecodeString("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==")
	if err != nil {
		t.Fatal(err)
	}
	asset = readResponse[Asset](t, h.upload("icon.webp", webp, 201, false))
	if asset.MIME != "image/webp" {
		t.Fatal("incorrect WebP MIME")
	}
	w = h.request("GET", asset.URL, nil, 200)
	if !bytes.Equal(w.Body.Bytes(), webp) {
		t.Fatal("WebP changed unexpectedly")
	}
}

func TestAssetBoundaryRejectionsAndRollback(t *testing.T) {
	h := adminHarness(t)
	for _, test := range []struct {
		name   string
		data   []byte
		status int
		extra  bool
	}{
		{"../../escape.png", iconPNG(t, 1), 400, false},
		{"..\\escape.png", iconPNG(t, 1), 400, false},
		{"active.svg", []byte(`<svg onload="alert(1)"><script>alert(2)</script></svg>`), 400, false},
		{"remote.svg", []byte(`<svg><image href="http://169.254.169.254/"/></svg>`), 400, false},
		{"fake.png", []byte("not an image"), 400, false},
		{"huge.png", make([]byte, assets.MaxBytes+1), 413, false},
		{"wide.png", iconPNG(t, 513), 400, false},
		{"extra.png", iconPNG(t, 1), 400, true},
	} {
		t.Run(test.name, func(t *testing.T) { h.upload(test.name, test.data, test.status, test.extra) })
	}
	if len(assetFiles(t, h)) != 0 {
		t.Fatal("rejected upload left a file")
	}
	old := readResponse[Asset](t, h.upload("old.png", iconPNG(t, 2), 201, false))
	if _, err := h.database.Exec(`CREATE TRIGGER reject_asset BEFORE INSERT ON icon_assets BEGIN SELECT RAISE(ABORT,'injected metadata failure'); END`); err != nil {
		t.Fatal(err)
	}
	h.upload("new.png", iconPNG(t, 3), 409, false)
	if len(assetFiles(t, h)) != 1 {
		t.Fatal("metadata rollback left new icon bytes")
	}
	h.request("GET", old.URL, nil, 200)
	var count int
	if err := h.database.QueryRow("SELECT COUNT(*) FROM icon_assets").Scan(&count); err != nil || count != 1 {
		t.Fatal("metadata rollback failed", err)
	}
}

func TestAssetSniffingAndGuards(t *testing.T) {
	h := adminHarness(t)
	cookie, csrf := h.cookie, h.csrf
	h.cookie = nil
	h.csrf = ""
	h.upload("icon.png", iconPNG(t, 1), 401, false)
	h.cookie = cookie
	h.upload("icon.png", iconPNG(t, 1), 403, false)
	h.csrf = csrf
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	header := textproto.MIMEHeader{"Content-Disposition": {`form-data; name="file"; filename="icon.svg"`}, "Content-Type": {"image/png"}}
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write([]byte(`<svg><script>active</script></svg>`))
	writer.Close()
	r := httptest.NewRequest("POST", origin+"/api/v1/admin/assets", &body)
	r.Header.Set("Origin", origin)
	r.Header.Set("X-CSRF-Token", csrf)
	r.Header.Set("Content-Type", writer.FormDataContentType())
	r.AddCookie(cookie)
	w := httptest.NewRecorder()
	h.server.ServeHTTP(w, r)
	if w.Code != 400 {
		t.Fatal("trusted forged MIME instead of actual bytes")
	}
}

func TestAssetTamperingIsNotServed(t *testing.T) {
	h := adminHarness(t)
	asset := readResponse[Asset](t, h.upload("icon.png", iconPNG(t, 4), 201, false))
	files := assetFiles(t, h)
	if err := os.WriteFile(files[0], []byte("tampered"), 0o600); err != nil {
		t.Fatal(err)
	}
	w := h.request("GET", asset.URL, nil, 500)
	if strings.Contains(w.Body.String(), h.server.config.DataDir) || strings.Contains(w.Body.String(), "tampered") {
		t.Fatal("corrupt file or local path exposed")
	}
}
