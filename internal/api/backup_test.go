package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"nexa-home/internal/assets"
	"nexa-home/internal/db"

	"github.com/google/uuid"
)

func (h *harness) export() Backup {
	h.t.Helper()
	return readResponse[Backup](h.t, h.request("GET", "/api/v1/admin/backup/export", nil, 200))
}
func (h *harness) stage(value Backup) string {
	h.t.Helper()
	result := readResponse[struct {
		Valid       bool           `json:"valid"`
		ImportToken string         `json:"importToken"`
		Summary     map[string]int `json:"summary"`
	}](h.t, h.request("POST", "/api/v1/admin/backup/validate", value, 200))
	if !result.Valid || result.ImportToken == "" || result.Summary["services"] != len(value.Services) {
		h.t.Fatal("invalid preview", result)
	}
	return result.ImportToken
}
func (h *harness) restore(token string, status int) *httptest.ResponseRecorder {
	h.t.Helper()
	return h.request("POST", "/api/v1/admin/backup/commit", map[string]any{"importToken": token, "replace": true}, status)
}
func cloneBackup(t *testing.T, value Backup) Backup {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var cloned Backup
	if err := json.Unmarshal(data, &cloned); err != nil {
		t.Fatal(err)
	}
	return cloned
}
func semanticBackup(value Backup) Backup {
	value.ExportedAt = ""
	value.Settings.Revision = 0
	value.Settings.UpdatedAt = ""
	for i := range value.Categories {
		value.Categories[i].CreatedAt = ""
		value.Categories[i].UpdatedAt = ""
	}
	for i := range value.Services {
		value.Services[i].CreatedAt = ""
		value.Services[i].UpdatedAt = ""
	}
	for i := range value.Tags {
		value.Tags[i].CreatedAt = ""
	}
	return value
}
func sameConfiguration(t *testing.T, before, after Backup) {
	t.Helper()
	before.ExportedAt = ""
	after.ExportedAt = ""
	if !reflect.DeepEqual(before, after) {
		t.Fatal("configuration changed despite failed validation or restore")
	}
}
func backupFixture(t *testing.T) (*harness, Backup) {
	t.Helper()
	h := adminHarness(t)
	category := h.category("Media", true)
	tag := h.tag("Home")
	asset := readResponse[Asset](t, h.upload("icon.svg", []byte(iconSVG), 201, false))
	input := serviceInput("Photos")
	input.CategoryID = &category.ID
	input.TagIDs = []string{tag.ID}
	input.IconKind = "asset"
	input.IconAssetID = &asset.ID
	input.IconValue = "Uploaded home icon"
	input.Links = append(input.Links, LinkInput{Label: "lan", URL: "http://192.168.1.20:5000"})
	h.service(input)
	return h, h.export()
}

func TestAllContractOperationsAreRegistered(t *testing.T) {
	h := newHarness(t)
	for _, op := range h.server.contract.Operations() {
		r := httptest.NewRequest(op.Method, origin+strings.ReplaceAll(op.Path, "{id}", uuid.NewString()), nil)
		_, pattern := h.server.mux.Handler(r)
		if pattern != op.Method+" "+op.Path {
			t.Fatalf("unregistered operation: %+v (matched %q)", op, pattern)
		}
	}
}

func TestBackupRoundtripPreservesCredentialsAndHashes(t *testing.T) {
	h, original := backupFixture(t)
	var passwordHash string
	if err := h.database.QueryRow("SELECT password_hash FROM admin_account").Scan(&passwordHash); err != nil {
		t.Fatal(err)
	}
	serialized, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{passwordHash, h.cookie.Value, h.csrf, h.setupToken, adminPassword} {
		if strings.Contains(string(serialized), secret) {
			t.Fatal("credential or token exported")
		}
	}
	beforeRevision := h.settings().Revision
	preview := cloneBackup(t, original)
	preview.Settings.Revision = 999999
	preview.Services[0].CreatedAt = "2099-01-01T00:00:00Z"
	token := h.stage(preview)
	if strings.Contains(h.logs.String(), token) {
		t.Fatal("import token logged")
	}
	h.category("Must be replaced", true)
	h.service(serviceInput("Temporary service"))
	garbage := readResponse[Asset](t, h.upload("unused.png", iconPNG(t, 7), 201, false))
	if _, err := h.database.Exec("INSERT INTO auth_rate_limits(key_hash,failure_count,window_started_at) VALUES('preserved-rate',1,?)", db.Timestamp(time.Now())); err != nil {
		t.Fatal(err)
	}
	result := readResponse[map[string]int64](t, h.restore(token, 200))
	if result["revision"] != beforeRevision+1 {
		t.Fatal("import trusted source revision", result)
	}
	restored := h.export()
	if !reflect.DeepEqual(semanticBackup(cloneBackup(t, original)), semanticBackup(cloneBackup(t, restored))) {
		t.Fatal("backup configuration or embedded icon hashes changed on roundtrip")
	}
	if restored.Services[0].CreatedAt == preview.Services[0].CreatedAt || restored.Settings.Revision == preview.Settings.Revision {
		t.Fatal("source timestamps/revision were trusted")
	}
	h.request("GET", "/api/v1/auth/me", nil, 200)
	var afterHash string
	if err := h.database.QueryRow("SELECT password_hash FROM admin_account").Scan(&afterHash); err != nil || afterHash != passwordHash {
		t.Fatal("administrator replaced", err)
	}
	var count int
	if err := h.database.QueryRow("SELECT COUNT(*) FROM auth_rate_limits WHERE key_hash='preserved-rate'").Scan(&count); err != nil || count != 1 {
		t.Fatal("rate limiter replaced", err)
	}
	if err := h.database.QueryRow("SELECT COUNT(*) FROM audit_log WHERE action='backup.restore'").Scan(&count); err != nil || count != 1 {
		t.Fatal("restore audit missing", err)
	}
	h.request("GET", garbage.URL, nil, 404)
	if len(assetFiles(t, h)) != 1 {
		t.Fatal("old unreferenced assets not collected")
	}
	h.restore(token, 403)
	if err := db.Check(context.Background(), h.database); err != nil {
		t.Fatal(err)
	}
}

func TestBackupInvalidInputsDoNotMutateConfiguration(t *testing.T) {
	h, baseline := backupFixture(t)
	for _, test := range []struct {
		name   string
		change func(*Backup)
	}{
		{"wrong format", func(v *Backup) { v.Format = "other" }},
		{"unsupported version", func(v *Backup) { v.Version = 3 }},
		{"duplicate category ID", func(v *Backup) { v.Categories = append(v.Categories, v.Categories[0]) }},
		{"duplicate category name", func(v *Backup) {
			copy := v.Categories[0]
			copy.ID = uuid.NewString()
			copy.Name = "MEDIA"
			v.Categories = append(v.Categories, copy)
		}},
		{"duplicate tag name", func(v *Backup) {
			copy := v.Tags[0]
			copy.ID = uuid.NewString()
			copy.Name = "HOME"
			v.Tags = append(v.Tags, copy)
		}},
		{"cross-table duplicate ID", func(v *Backup) { v.Tags[0].ID = v.Categories[0].ID }},
		{"missing category", func(v *Backup) { id := uuid.NewString(); v.Services[0].CategoryID = &id }},
		{"missing tag", func(v *Backup) { v.Services[0].TagIDs = []string{uuid.NewString()} }},
		{"missing icon bytes", func(v *Backup) { v.Assets = []BackupAsset{} }},
		{"duplicate link ID", func(v *Backup) { v.Services[0].Links[1].ID = v.Services[0].Links[0].ID }},
		{"duplicate primary", func(v *Backup) { v.Services[0].Links[1].Label = "primary" }},
		{"missing primary", func(v *Backup) { v.Services[0].Links = v.Services[0].Links[1:] }},
		{"unsafe URL", func(v *Backup) { v.Services[0].Links[0].URL = "javascript:alert(1)" }},
		{"credentials in URL", func(v *Backup) { v.Services[0].Links[0].URL = "https://user:secret@example.com" }},
		{"invalid icon registry", func(v *Backup) {
			v.Services[0].IconKind = "lucide"
			v.Services[0].IconValue = "not-allowed"
			v.Services[0].IconAssetID = nil
		}},
		{"negative position", func(v *Backup) { v.Services[0].Position = -1 }},
		{"excessive position", func(v *Backup) { v.Categories[0].Position = MaxPosition + 1 }},
		{"non-v4 ID", func(v *Backup) { v.Services[0].ID = "00000000-0000-0000-0000-000000000000" }},
		{"invalid timestamp", func(v *Backup) { v.Services[0].UpdatedAt = "not a timestamp" }},
		{"blank title", func(v *Backup) { v.Settings.SiteTitle = "  " }},
		{"invalid base64", func(v *Backup) { v.Assets[0].Base64 = "!not-base64!" }},
		{"noncanonical base64", func(v *Backup) { v.Assets[0].Base64 += "\n" }},
		{"oversized base64", func(v *Backup) {
			v.Assets[0].Base64 = strings.Repeat("A", base64.StdEncoding.EncodedLen(assets.MaxBytes)+1)
		}},
		{"corrupt image", func(v *Backup) { v.Assets[0].Base64 = base64.StdEncoding.EncodeToString([]byte("corrupt")) }},
		{"MIME mismatch", func(v *Backup) { v.Assets[0].MIME = "image/png" }},
		{"active SVG", func(v *Backup) {
			v.Assets[0].Base64 = base64.StdEncoding.EncodeToString([]byte(`<svg onload="alert(1)"/>`))
		}},
		{"duplicate icon hash", func(v *Backup) { copy := v.Assets[0]; copy.ID = uuid.NewString(); v.Assets = append(v.Assets, copy) }},
		{"too many services", func(v *Backup) {
			v.Services = make([]Service, MaxServices+1)
			for i := range v.Services {
				v.Services[i] = baseline.Services[0]
			}
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			value := cloneBackup(t, baseline)
			test.change(&value)
			h.request("POST", "/api/v1/admin/backup/validate", value, 400)
			sameConfiguration(t, baseline, h.export())
			if len(assetFiles(t, h)) != 1 {
				t.Fatal("validation wrote files")
			}
		})
	}
	var raw map[string]any
	encoded, _ := json.Marshal(baseline)
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatal(err)
	}
	raw["admin_account"] = map[string]string{"password": "must-not-import"}
	h.request("POST", "/api/v1/admin/backup/validate", raw, 400)
	delete(raw, "admin_account")
	raw["assets"].([]any)[0].(map[string]any)["sha256"] = strings.Repeat("0", 64)
	h.request("POST", "/api/v1/admin/backup/validate", raw, 400)
	sameConfiguration(t, baseline, h.export())
}

func TestImportTokenSessionExpiryConfirmationAndConcurrency(t *testing.T) {
	h, backup := backupFixture(t)
	token := h.stage(backup)
	h.request("POST", "/api/v1/admin/backup/commit", map[string]any{"importToken": token, "replace": false}, 400)
	ownerCookie, ownerCSRF := h.cookie, h.csrf
	h.login()
	h.restore(token, 403)
	h.cookie = ownerCookie
	h.csrf = ownerCSRF
	results := make(chan *httptest.ResponseRecorder, 2)
	for range 2 {
		go func() {
			body, _ := json.Marshal(map[string]any{"importToken": token, "replace": true})
			r := httptest.NewRequest("POST", origin+"/api/v1/admin/backup/commit", bytes.NewReader(body))
			r.Header.Set("Content-Type", "application/json")
			r.Header.Set("Origin", origin)
			r.Header.Set("X-CSRF-Token", h.csrf)
			r.AddCookie(h.cookie)
			w := httptest.NewRecorder()
			h.server.ServeHTTP(w, r)
			results <- w
		}()
	}
	counts := map[int]int{}
	for range 2 {
		w := <-results
		counts[w.Code]++
		if err := h.server.contract.ValidateResponse("POST", "/api/v1/admin/backup/commit", w.Code, w.Body.Bytes()); err != nil {
			t.Fatal(err)
		}
	}
	if counts[200] != 1 || counts[403] != 1 {
		t.Fatal("import token was not single-use", counts)
	}
	token = h.stage(backup)
	key := sha256.Sum256([]byte(token))
	h.server.importMu.Lock()
	pending := h.server.imports[key]
	if pending == nil || pending.expires.Before(time.Now().Add(4*time.Minute)) {
		h.server.importMu.Unlock()
		t.Fatal("incorrect import TTL")
	}
	pending.expires = time.Now().Add(-time.Second)
	h.server.importMu.Unlock()
	before := h.export()
	h.restore(token, 403)
	sameConfiguration(t, before, h.export())
	token = h.stage(backup)
	h.request("POST", "/api/v1/auth/logout", nil, 204)
	h.restore(token, 401)
	h.login()
	h.restore(token, 403)
}

func TestImportCapacityAndReplacement(t *testing.T) {
	h, backup := backupFixture(t)
	first := h.stage(backup)
	cookie, csrf := h.cookie, h.csrf
	h.login()
	h.stage(backup)
	h.login()
	w := h.request("POST", "/api/v1/admin/backup/validate", backup, 429)
	if w.Header().Get("Retry-After") != "300" {
		t.Fatal("incorrect import retry interval")
	}
	h.cookie = cookie
	h.csrf = csrf
	replacement := h.stage(backup)
	h.restore(first, 403)
	h.restore(replacement, 200)
	h.server.importMu.Lock()
	count := len(h.server.imports)
	h.server.importMu.Unlock()
	if count != 1 {
		t.Fatal("pending import capacity incorrect", count)
	}
}

func addFreshIcon(t *testing.T, value *Backup, excluded map[string]bool) assets.Image {
	t.Helper()
	for size := 1; size <= 128; size++ {
		image, err := assets.Validate(iconPNG(t, size))
		if err != nil {
			t.Fatal(err)
		}
		if excluded[image.SHA256[:2]] {
			continue
		}
		excluded[image.SHA256[:2]] = true
		value.Assets = append(value.Assets, BackupAsset{ID: uuid.NewString(), MIME: image.MIME, Base64: base64.StdEncoding.EncodeToString(image.Data)})
		return image
	}
	t.Fatal("could not create distinct test icon prefixes")
	return assets.Image{}
}

func TestRestoreFilesystemAndDatabaseFailuresRollback(t *testing.T) {
	for _, fault := range []string{"filesystem", "database"} {
		t.Run(fault, func(t *testing.T) {
			h, baseline := backupFixture(t)
			value := cloneBackup(t, baseline)
			excluded := make(map[string]bool)
			for _, name := range assetFiles(t, h) {
				excluded[filepath.Base(filepath.Dir(name))] = true
			}
			first := addFreshIcon(t, &value, excluded)
			second := addFreshIcon(t, &value, excluded)
			token := h.stage(value)
			status := 500
			if fault == "filesystem" {
				// A real ENOTDIR error occurs after the first new icon has been staged.
				if err := os.WriteFile(filepath.Join(h.server.config.DataDir, "assets", second.SHA256[:2]), []byte("blocked directory"), 0o600); err != nil {
					t.Fatal(err)
				}
			} else {
				if _, err := h.database.Exec(`CREATE TRIGGER reject_restore BEFORE INSERT ON categories BEGIN SELECT RAISE(ABORT,'injected restore failure'); END`); err != nil {
					t.Fatal(err)
				}
				status = 409
			}
			h.restore(token, status)
			h.restore(token, 403)
			sameConfiguration(t, baseline, h.export())
			if _, err := os.Stat(filepath.Join(h.server.config.DataDir, "assets", first.Path())); !errors.Is(err, os.ErrNotExist) {
				t.Fatal("newly staged icon was not rolled back", err)
			}
			h.request("GET", "/assets/"+baseline.Assets[0].ID, nil, 200)
			if err := db.Check(context.Background(), h.database); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestBackupWithoutAssetsAndBodyLimit(t *testing.T) {
	h, baseline := backupFixture(t)
	partial := readResponse[Backup](t, h.request("GET", "/api/v1/admin/backup/export?includeAssets=false", nil, 200))
	if len(partial.Assets) != 0 {
		t.Fatal("assets included despite opt-out")
	}
	h.request("POST", "/api/v1/admin/backup/validate", partial, 400)
	h.request("GET", "/api/v1/admin/backup/export?includeAssets=1", nil, 400)
	r := httptest.NewRequest("POST", origin+"/api/v1/admin/backup/validate", strings.NewReader(strings.Repeat(" ", MaxBackupBytes+1)))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", origin)
	r.Header.Set("X-CSRF-Token", h.csrf)
	r.AddCookie(h.cookie)
	w := httptest.NewRecorder()
	h.server.ServeHTTP(w, r)
	if w.Code != 413 {
		t.Fatalf("backup body limit: %d %s", w.Code, w.Body.String())
	}
	sameConfiguration(t, baseline, h.export())
}

func TestPortableBudgetMatchesExportAndRollsBack(t *testing.T) {
	h := adminHarness(t)
	value := h.export()
	value.Settings.SiteTitle = "<escaped & title>"
	sizes := map[string]int{}
	for _, size := range []int{1, 2, 3, 4, 1024} {
		id := uuid.NewString()
		value.Assets = append(value.Assets, BackupAsset{ID: id, MIME: "image/png"})
		sizes[id] = size
	}
	estimated, err := portableSize(value, sizes)
	if err != nil {
		t.Fatal(err)
	}
	for i := range value.Assets {
		value.Assets[i].Base64 = base64.StdEncoding.EncodeToString(make([]byte, sizes[value.Assets[i].ID]))
	}
	actual, err := json.Marshal(value)
	if err != nil || estimated != len(actual)+1 {
		t.Fatalf("portable size: %d != %d: %v", estimated, len(actual)+1, err)
	}
	r := httptest.NewRequest("POST", origin+"/api/v1/admin/assets", nil)
	err = h.server.mutate(r, "test.budget", "asset", "", func(tx *sql.Tx) error {
		// Exercise metadata budgeting without allocating twelve maximum-size files.
		for i := 0; i < 12; i++ {
			hash := fmt.Sprintf("%064x", i)
			if _, err := tx.Exec(`INSERT INTO icon_assets(id,kind,mime_type,sha256,relative_path,byte_size,created_at) VALUES(?,'png','image/png',?,?,?,?)`, uuid.NewString(), hash, hash[:2]+"/"+hash+".png", assets.MaxBytes, db.Timestamp(time.Now())); err != nil {
				return err
			}
		}
		return nil
	})
	var limit *problem
	if !errors.As(err, &limit) || limit.code != "LIMIT_EXCEEDED" {
		t.Fatal("unrestorable state accepted", err)
	}
	var count int
	if err := h.database.QueryRow("SELECT COUNT(*) FROM icon_assets").Scan(&count); err != nil || count != 0 {
		t.Fatal("budget rejection was not transactional", count, err)
	}
}

func TestImportPositionBoundsAndUnicodeUniqueness(t *testing.T) {
	h, value := backupFixture(t)
	value.Categories[0].Position = MaxPosition
	value.Services[0].Position = MaxPosition
	h.restore(h.stage(value), 200)
	h.request("POST", "/api/v1/admin/categories", CategoryInput{Name: "Overflow", Icon: "layout-grid", IsVisible: true}, 409)
	input := serviceInput("Overflow")
	input.CategoryID = &value.Categories[0].ID
	h.request("POST", "/api/v1/admin/services", input, 409)
	h.request("PUT", "/api/v1/admin/categories/reorder", map[string]any{"ids": []string{value.Categories[0].ID}}, 204)
	h.request("PUT", "/api/v1/admin/services/reorder", map[string]any{"categoryId": value.Categories[0].ID, "ids": []string{value.Services[0].ID}}, 204)
	h.category("Recovered", true)
	h.service(input)
	h.tag("Straße")
	h.request("POST", "/api/v1/admin/tags", map[string]string{"name": "STRASSE"}, 409)
	value = h.export()
	copy := value.Tags[len(value.Tags)-1]
	copy.ID = uuid.NewString()
	copy.Name = "STRASSE"
	value.Tags = append(value.Tags, copy)
	h.request("POST", "/api/v1/admin/backup/validate", value, 400)
}
