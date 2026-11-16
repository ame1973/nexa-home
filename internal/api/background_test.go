package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"math/rand"
	"reflect"
	"strings"
	"testing"

	"nexa-home/internal/assets"

	"github.com/google/uuid"
)

func backgroundUpload(data []byte) json.RawMessage {
	value, _ := json.Marshal(base64.StdEncoding.EncodeToString(data))
	return value
}

func TestBackgroundSettingsLayoutAndAccess(t *testing.T) {
	h := adminHarness(t)
	initial := h.settings()
	input := SettingsInput{SettingsFields: initial.SettingsFields, ExpectedRevision: initial.Revision}
	input.ThemePreset, input.LayoutPreset = "tide", "forest"
	input.BackgroundUpload = backgroundUpload(iconPNG(t, 800))
	saved := readResponse[Settings](t, h.request("PUT", "/api/v1/admin/settings", input, 200))
	if saved.ThemePreset != "tide" || saved.LayoutPreset != "forest" || !backgroundHash.MatchString(saved.BackgroundImage) {
		t.Fatal("palette, layout or background were not saved independently")
	}
	path := "/api/v1/public/background/" + saved.BackgroundImage
	image := h.request("GET", path, nil, 200)
	if image.Header().Get("Content-Type") != "image/png" || image.Header().Get("Cache-Control") != "no-store" || image.Header().Get("Cross-Origin-Resource-Policy") != "same-origin" || !strings.Contains(image.Header().Get("Content-Security-Policy"), "sandbox") {
		t.Fatal("background response is missing security headers")
	}
	input.LayoutPreset = "dune"
	h.request("PUT", "/api/v1/admin/settings", input, 409)
	if !reflect.DeepEqual(h.settings(), saved) {
		t.Fatal("stale settings update replaced the image")
	}
	for _, invalid := range []json.RawMessage{
		backgroundUpload([]byte("<svg xmlns='http://www.w3.org/2000/svg'/>")),
		json.RawMessage(`"https://example.test/image.png"`),
		json.RawMessage(`"not base64!"`),
	} {
		rejected := SettingsInput{SettingsFields: saved.SettingsFields, ExpectedRevision: saved.Revision, BackgroundUpload: invalid}
		h.request("PUT", "/api/v1/admin/settings", rejected, 400)
		if !reflect.DeepEqual(h.settings(), saved) {
			t.Fatal("invalid background changed settings")
		}
	}

	body, _ := json.Marshal(SettingsInput{SettingsFields: saved.SettingsFields, ExpectedRevision: saved.Revision})
	var legacy map[string]any
	if err := json.Unmarshal(body, &legacy); err != nil {
		t.Fatal(err)
	}
	delete(legacy, "layoutPreset")
	legacy["themePreset"] = "graphite"
	updated := readResponse[Settings](t, h.request("PUT", "/api/v1/admin/settings", legacy, 200))
	if updated.ThemePreset != "graphite" || updated.LayoutPreset != "forest" || updated.BackgroundImage != saved.BackgroundImage {
		t.Fatal("legacy client changed the independent layout or background")
	}
	cookie, csrf := h.cookie, h.csrf
	h.cookie, h.csrf = nil, ""
	h.request("GET", path, nil, 200)
	h.cookie, h.csrf = cookie, csrf
	input = SettingsInput{SettingsFields: updated.SettingsFields, ExpectedRevision: updated.Revision}
	input.AccessMode = "private"
	private := readResponse[Settings](t, h.request("PUT", "/api/v1/admin/settings", input, 200))
	h.cookie, h.csrf = nil, ""
	h.request("GET", path, nil, 401)
	h.cookie, h.csrf = cookie, csrf
	h.request("GET", path, nil, 200)
	h.request("GET", "/api/v1/public/background/"+strings.Repeat("a", 64), nil, 404)
	input = SettingsInput{SettingsFields: private.SettingsFields, ExpectedRevision: private.Revision, BackgroundUpload: json.RawMessage("null")}
	cleared := readResponse[Settings](t, h.request("PUT", "/api/v1/admin/settings", input, 200))
	if cleared.BackgroundImage != "" {
		t.Fatal("background removal failed")
	}
	h.request("GET", path, nil, 404)
}

func TestBackgroundBackupRoundtripAndValidation(t *testing.T) {
	h := adminHarness(t)
	settings := h.settings()
	input := SettingsInput{SettingsFields: settings.SettingsFields, ExpectedRevision: settings.Revision, BackgroundUpload: backgroundUpload(iconPNG(t, 700))}
	input.ThemePreset, input.LayoutPreset = "dune", "graphite"
	saved := readResponse[Settings](t, h.request("PUT", "/api/v1/admin/settings", input, 200))
	backup := h.export()
	if backup.Version != 4 || backup.Background == nil || backup.Background.Base64 == "" || backup.Settings.BackgroundImage != saved.BackgroundImage {
		t.Fatal("background missing from full portable backup")
	}
	partial := readResponse[Backup](t, h.request("GET", "/api/v1/admin/backup/export?includeAssets=false", nil, 200))
	if partial.Background != nil {
		t.Fatal("background bytes were included despite opting out")
	}
	h.request("POST", "/api/v1/admin/backup/validate", partial, 400)
	for _, change := range []func(*Backup){
		func(v *Backup) { v.Background = nil },
		func(v *Backup) { v.Background.Base64 = base64.StdEncoding.EncodeToString([]byte("<svg/>")) },
		func(v *Backup) { v.Background.MIME = "image/jpeg" },
		func(v *Backup) { v.Settings.BackgroundImage = strings.Repeat("a", 64) },
	} {
		invalid := cloneBackup(t, backup)
		change(&invalid)
		h.request("POST", "/api/v1/admin/backup/validate", invalid, 400)
		sameConfiguration(t, backup, h.export())
	}
	remove := SettingsInput{SettingsFields: saved.SettingsFields, ExpectedRevision: saved.Revision, BackgroundUpload: json.RawMessage("null")}
	remove.LayoutPreset = "forest"
	h.request("PUT", "/api/v1/admin/settings", remove, 200)
	h.restore(h.stage(backup), 200)
	if restored := h.settings(); restored.BackgroundImage != saved.BackgroundImage || restored.LayoutPreset != "graphite" {
		t.Fatal("restore lost background or layout")
	}
	h.request("GET", "/api/v1/public/background/"+saved.BackgroundImage, nil, 200)

	legacy := cloneBackup(t, backup)
	legacy.Version, legacy.Background, legacy.Settings.BackgroundImage = 3, nil, ""
	legacy.Settings.ThemePreset, legacy.Settings.LayoutPreset = "tide", "forest"
	h.restore(h.stage(legacy), 200)
	if restored := h.settings(); restored.BackgroundImage != "" || restored.LayoutPreset != "tide" {
		t.Fatal("legacy backup did not preserve its former layout")
	}
}

func TestBackgroundPortableBudgetAndDoctor(t *testing.T) {
	h := adminHarness(t)
	before := h.settings()
	err := h.server.withTx(context.Background(), func(tx *sql.Tx) error {
		for i := 0; i < 12; i++ {
			size := assets.MaxBytes
			if i == 11 {
				size -= 40000
			}
			hash := fmt.Sprintf("%x", sha256.Sum256([]byte(fmt.Sprintf("background-budget-%d", i))))
			if _, err := tx.Exec(`INSERT INTO icon_assets(id,kind,mime_type,sha256,relative_path,byte_size,created_at) VALUES(?,'png','image/png',?,?,?,'stamp')`, uuid.NewString(), hash, hash[:2]+"/"+hash+".png", size); err != nil {
				return err
			}
		}
		return h.server.ensurePortable(context.Background(), tx)
	})
	if err != nil {
		t.Fatal("fixture exceeded the budget before adding a background", err)
	}
	picture := image.NewNRGBA(image.Rect(0, 0, 256, 256))
	random := rand.New(rand.NewSource(1))
	if _, err := random.Read(picture.Pix); err != nil {
		t.Fatal(err)
	}
	var imageData bytes.Buffer
	if err := png.Encode(&imageData, picture); err != nil {
		t.Fatal(err)
	}
	input := SettingsInput{SettingsFields: before.SettingsFields, ExpectedRevision: before.Revision, BackgroundUpload: backgroundUpload(imageData.Bytes())}
	h.request("PUT", "/api/v1/admin/settings", input, 409)
	if got := h.settings(); !reflect.DeepEqual(got, before) {
		t.Fatal("over-budget background was not rolled back")
	}
	var count int
	if err := h.database.QueryRow("SELECT COUNT(*) FROM site_background").Scan(&count); err != nil || count != 0 {
		t.Fatal("rejected image left stored bytes", err)
	}

	// A fresh fixture can be checked without the synthetic icon metadata above.
	doctor := adminHarness(t)
	settings := doctor.settings()
	value := SettingsInput{SettingsFields: settings.SettingsFields, ExpectedRevision: settings.Revision, BackgroundUpload: backgroundUpload(iconPNG(t, 32))}
	doctor.request("PUT", "/api/v1/admin/settings", value, 200)
	if err := CheckData(context.Background(), doctor.database, doctor.server.config.DataDir); err != nil {
		t.Fatal("doctor rejected a valid background", err)
	}
	var stored []byte
	if err := doctor.database.QueryRow("SELECT content FROM site_background").Scan(&stored); err != nil {
		t.Fatal(err)
	}
	stored[len(stored)-1] ^= 1
	if _, err := doctor.database.Exec("UPDATE site_background SET content=?", stored); err != nil {
		t.Fatal(err)
	}
	if err := CheckData(context.Background(), doctor.database, doctor.server.config.DataDir); err == nil {
		t.Fatal("doctor accepted a corrupt background")
	}
}
