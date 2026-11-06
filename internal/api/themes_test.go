package api

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/google/uuid"
)

func themeFixture() *CustomTheme {
	return &CustomTheme{SchemaVersion: 1, Name: "My Tide", Radius: 16, Shadow: "soft", Variants: ThemeVariants{
		Light: ThemePalette{Background: "#f0f7f8", Surface: "#ffffff", Accent: "#006c73"},
		Dark:  ThemePalette{Background: "#0c1b22", Surface: "#132d38", Accent: "#6bd3cc"},
	}}
}

func TestThemeSettingsCASPublicProjectionAndBackupRoundtrip(t *testing.T) {
	h := adminHarness(t)
	settings := h.settings()
	if settings.ThemePreset != "future-glass" || settings.CustomTheme != nil || settings.CustomCSS != "" {
		t.Fatal("incorrect initial theme")
	}
	input := SettingsInput{SettingsFields: settings.SettingsFields, ExpectedRevision: settings.Revision}
	input.ThemePreset, input.CustomTheme, input.CustomCSS = "custom", themeFixture(), "@layer overrides { @media (min-width: 10px) { .service-link { border-radius: 12px; } } }\n/* </style><script>not executable</script> */"
	updated := readResponse[Settings](t, h.request("PUT", "/api/v1/admin/settings", input, 200))
	if !reflect.DeepEqual(updated.SettingsFields, input.SettingsFields) || updated.Revision != settings.Revision+1 {
		t.Fatal("theme did not persist with CAS")
	}
	h.request("PUT", "/api/v1/admin/settings", input, 409)
	public := readResponse[Bootstrap](t, h.request("GET", "/api/v1/public/bootstrap", nil, 200))
	if !reflect.DeepEqual(public.Settings, updated) {
		t.Fatal("public appearance differs from persisted settings")
	}
	backup := h.export()
	if backup.Version != 2 {
		t.Fatal("new appearance was not exported as backup version 2")
	}
	preview := readResponse[struct {
		Summary map[string]int `json:"summary"`
	}](t, h.request("POST", "/api/v1/admin/backup/validate", backup, 200))
	if preview.Summary["settingsChanged"] != 0 {
		t.Fatal("equal decoded custom theme compared by pointer identity")
	}
	backup.Settings.CustomCSS += "\nbody { letter-spacing: .01em; }"
	preview = readResponse[struct {
		Summary map[string]int `json:"summary"`
	}](t, h.request("POST", "/api/v1/admin/backup/validate", backup, 200))
	if preview.Summary["settingsChanged"] != 1 {
		t.Fatal("CSS change absent from preview")
	}
	h.restore(h.stage(backup), 200)
	if got := h.settings(); !reflect.DeepEqual(got.SettingsFields, backup.Settings.SettingsFields) || got.Revision != updated.Revision+1 {
		t.Fatal("restore lost theme, CSS or revision binding")
	}
	h.request("GET", "/api/v1/auth/me", nil, 200)
}

func TestLegacySettingsUpdatesPreserveNewAppearanceAndLegacyBackupDefaults(t *testing.T) {
	h := adminHarness(t)
	original := h.settings()
	original.ThemePreset, original.CustomTheme, original.CustomCSS = "custom", themeFixture(), "body { --my-color: red; }"
	saved := readResponse[Settings](t, h.request("PUT", "/api/v1/admin/settings", SettingsInput{SettingsFields: original.SettingsFields, ExpectedRevision: original.Revision}, 200))
	encoded, _ := json.Marshal(SettingsInput{SettingsFields: saved.SettingsFields, ExpectedRevision: saved.Revision})
	var legacy map[string]any
	if err := json.Unmarshal(encoded, &legacy); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"themePreset", "customTheme", "customCSS"} {
		delete(legacy, name)
	}
	legacy["siteTitle"] = "Old client"
	updated := readResponse[Settings](t, h.request("PUT", "/api/v1/admin/settings", legacy, 200))
	if updated.SiteTitle != "Old client" || updated.ThemePreset != "custom" || updated.CustomCSS != saved.CustomCSS || !reflect.DeepEqual(updated.CustomTheme, saved.CustomTheme) {
		t.Fatal("legacy settings write erased a newer appearance")
	}
	backup := h.export()
	encoded, _ = json.Marshal(backup)
	var portable map[string]any
	if err := json.Unmarshal(encoded, &portable); err != nil {
		t.Fatal(err)
	}
	portable["version"] = 1
	for _, name := range []string{"themePreset", "customTheme", "customCSS"} {
		delete(portable["settings"].(map[string]any), name)
	}
	preview := readResponse[struct {
		ImportToken string `json:"importToken"`
	}](t, h.request("POST", "/api/v1/admin/backup/validate", portable, 200))
	h.restore(preview.ImportToken, 200)
	if got := h.settings(); got.ThemePreset != "future-glass" || got.CustomTheme != nil || got.CustomCSS != "" || got.SiteTitle != "Old client" {
		t.Fatal("legacy backup did not restore with safe presentation defaults")
	}
	portable["version"] = 2
	h.request("POST", "/api/v1/admin/backup/validate", portable, 400)
}

func TestThemeAndCSSValidationIsAtomicAndStrict(t *testing.T) {
	h := adminHarness(t)
	baseline := h.settings()
	for _, test := range []struct {
		name   string
		change func(*SettingsInput)
	}{
		{"unknown preset", func(v *SettingsInput) { v.ThemePreset = "remote" }},
		{"missing custom", func(v *SettingsInput) { v.ThemePreset = "custom" }},
		{"schema", func(v *SettingsInput) { v.CustomTheme = themeFixture(); v.CustomTheme.SchemaVersion = 2 }},
		{"name", func(v *SettingsInput) { v.CustomTheme = themeFixture(); v.CustomTheme.Name = "  " }},
		{"name control", func(v *SettingsInput) { v.CustomTheme = themeFixture(); v.CustomTheme.Name = "bad\nname" }},
		{"radius", func(v *SettingsInput) { v.CustomTheme = themeFixture(); v.CustomTheme.Radius = 999 }},
		{"shadow", func(v *SettingsInput) { v.CustomTheme = themeFixture(); v.CustomTheme.Shadow = "url(example)" }},
		{"color injection", func(v *SettingsInput) {
			v.CustomTheme = themeFixture()
			v.CustomTheme.Variants.Light.Accent = "red; display:none"
		}},
		{"contrast", func(v *SettingsInput) {
			v.CustomTheme = themeFixture()
			v.CustomTheme.Variants.Dark.Surface = "#ffffff"
		}},
		{"oversize css", func(v *SettingsInput) { v.CustomCSS = strings.Repeat("x", MaxCSSBytes+1) }},
		{"utf8 bytes", func(v *SettingsInput) { v.CustomCSS = strings.Repeat("森", MaxCSSBytes/3+1) }},
		{"NUL", func(v *SettingsInput) { v.CustomCSS = "body{color:red}\x00" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			input := SettingsInput{SettingsFields: baseline.SettingsFields, ExpectedRevision: baseline.Revision}
			test.change(&input)
			h.request("PUT", "/api/v1/admin/settings", input, 400)
			if !reflect.DeepEqual(h.settings(), baseline) {
				t.Fatal("invalid appearance mutated settings")
			}
		})
	}
	for _, field := range []string{"themePreset", "customTheme", "customCSS"} {
		input := map[string]any{"siteTitle": baseline.SiteTitle, "siteSubtitle": baseline.SiteSubtitle, "theme": baseline.Theme, "accent": baseline.Accent, "accessMode": baseline.AccessMode, "glassEnabled": baseline.GlassEnabled, "cardDensity": baseline.CardDensity, "expectedRevision": baseline.Revision, field: nil}
		if field == "themePreset" {
			input[field] = "forest"
		}
		if field == "customCSS" {
			input[field] = ""
		}
		h.request("PUT", "/api/v1/admin/settings", input, 400)
	}
	input := SettingsInput{SettingsFields: baseline.SettingsFields, ExpectedRevision: baseline.Revision}
	input.CustomTheme = themeFixture()
	body, _ := json.Marshal(input)
	body = []byte(strings.Replace(string(body), `"background":"#f0f7f8"`, `"background":"#f0f7f8","background":"#ffffff"`, 1))
	request := httptest.NewRequest("PUT", origin+"/api/v1/admin/settings", strings.NewReader(string(body)))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", origin)
	request.Header.Set("X-CSRF-Token", h.csrf)
	request.AddCookie(h.cookie)
	response := httptest.NewRecorder()
	h.server.ServeHTTP(response, request)
	if response.Code != 400 {
		t.Fatal("duplicate theme key accepted")
	}
	var object map[string]any
	if err := json.Unmarshal(body, &object); err != nil {
		t.Fatal(err)
	}
	object["customTheme"].(map[string]any)["variants"].(map[string]any)["dark"].(map[string]any)["css"] = "body{}"
	h.request("PUT", "/api/v1/admin/settings", object, 400)
}

func TestArbitraryCSSByteBoundaryEscapingAndNoServerFetch(t *testing.T) {
	var fetched atomic.Int64
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fetched.Add(1); w.WriteHeader(204) }))
	defer target.Close()
	h := adminHarness(t)
	settings := h.settings()
	input := SettingsInput{SettingsFields: settings.SettingsFields, ExpectedRevision: settings.Revision}
	// The maximum valid source must fit even when JSON escapes each character.
	input.CustomCSS = strings.Repeat("<", MaxCSSBytes)
	saved := readResponse[Settings](t, h.request("PUT", "/api/v1/admin/settings", input, 200))
	if saved.CustomCSS != input.CustomCSS {
		t.Fatal("CSS source changed")
	}
	input.ExpectedRevision = saved.Revision
	input.CustomCSS = "@import url('" + target.URL + "/style'); @font-face {font-family: example; src:url('" + target.URL + "/font');} body:has(.service-link) { background: url('" + target.URL + "/image'); }"
	saved = readResponse[Settings](t, h.request("PUT", "/api/v1/admin/settings", input, 200))
	h.request("GET", "/api/v1/public/bootstrap", nil, 200)
	h.export()
	if fetched.Load() != 0 || saved.CustomCSS != input.CustomCSS {
		t.Fatal("server fetched CSS resources or rewrote arbitrary rules")
	}
	if _, err := h.database.Exec("UPDATE app_settings SET custom_css=?", strings.Repeat("x", MaxCSSBytes+1)); err == nil {
		t.Fatal("database byte cap disabled")
	}
}

func TestThemeCSSUsesTransactionalPortableBudget(t *testing.T) {
	h := adminHarness(t)
	baseline := h.settings()
	err := h.server.withTx(context.Background(), func(tx *sql.Tx) error {
		for i := 0; i < 12; i++ {
			size := 1 << 20
			if i == 11 {
				size -= 40000
			}
			hash := fmt.Sprintf("%x", sha256.Sum256([]byte(fmt.Sprintf("theme-budget-%d", i))))
			if _, err := tx.Exec(`INSERT INTO icon_assets(id,kind,mime_type,sha256,relative_path,byte_size,created_at) VALUES(?,'png','image/png',?,?,?,'stamp')`, uuid.NewString(), hash, hash[:2]+"/"+hash+".png", size); err != nil {
				return err
			}
		}
		return h.server.ensurePortable(context.Background(), tx)
	})
	if err != nil {
		t.Fatal("fixture is not within portable budget", err)
	}
	input := SettingsInput{SettingsFields: baseline.SettingsFields, ExpectedRevision: baseline.Revision}
	input.CustomCSS = strings.Repeat("x", MaxCSSBytes)
	response := h.request("PUT", "/api/v1/admin/settings", input, 409)
	if !strings.Contains(response.Body.String(), "LIMIT_EXCEEDED") || !reflect.DeepEqual(h.settings(), baseline) {
		t.Fatal("over-budget CSS was not rolled back")
	}
	var count int
	if err := h.database.QueryRow("SELECT COUNT(*) FROM audit_log WHERE action='settings.update'").Scan(&count); err != nil || count != 0 {
		t.Fatal("failed CSS mutation left an audit entry", err)
	}
}
