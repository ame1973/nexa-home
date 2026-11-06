package main

import (
	"bytes"
	"context"
	"database/sql"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	migrations "nexa-home/db"
	"nexa-home/internal/auth"
	"nexa-home/internal/config"
	"nexa-home/internal/db"
)

func legacyInstallation(t *testing.T) (string, *sql.DB) {
	t.Helper()
	directory := filepath.Join(t.TempDir(), "legacy")
	if err := os.Mkdir(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	file, err := os.OpenFile(filepath.Join(directory, "nexa.db"), os.O_CREATE|os.O_EXCL|os.O_RDWR, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	file.Close()
	database, err := sql.Open("sqlite", filepath.Join(directory, "nexa.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	schema, err := migrations.Files.ReadFile("001_init.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(string(schema)); err != nil {
		t.Fatal(err)
	}
	return directory, database
}

func TestDoctorNeverMigratesLegacyData(t *testing.T) {
	directory, legacy := legacyInstallation(t)
	legacy.Close()
	before, err := os.ReadFile(filepath.Join(directory, "nexa.db"))
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := doctor(context.Background(), config.Config{DataDir: directory}, &output); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(filepath.Join(directory, "nexa.db"))
	if err != nil || !bytes.Equal(before, after) {
		t.Fatal("doctor migrated or changed the legacy database", err)
	}
	if _, err := os.Stat(filepath.Join(directory, "nexa.pre-migration-v1-to-v2.db")); !os.IsNotExist(err) {
		t.Fatal("doctor unexpectedly took an upgrade snapshot", err)
	}
	if !strings.Contains(output.String(), "are valid") || strings.Contains(output.String(), "setupToken") {
		t.Fatal("doctor did not report a credential-free offline check")
	}
}

func TestThemeUpgradePreservesRealSessionCSRFAndPrivateCatalog(t *testing.T) {
	directory, legacy := legacyInstallation(t)
	ctx := context.Background()
	authentication, setupToken, err := auth.New(ctx, legacy)
	if err != nil {
		t.Fatal(err)
	}
	if err := authentication.Setup(ctx, setupToken, "owner", "A synthetic upgrade test password", "127.0.0.1"); err != nil {
		t.Fatal(err)
	}
	token, session, err := authentication.Login(ctx, "owner", "A synthetic upgrade test password", "127.0.0.1", "upgrade-fixture")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := legacy.Exec(`UPDATE app_settings SET access_mode='private',theme='system',accent='#123456',revision=42;
	INSERT INTO categories(id,name,created_at,updated_at) VALUES('00000000-0000-4000-8000-000000000001','Preserved category','stamp','stamp')`); err != nil {
		t.Fatal(err)
	}
	legacy.Close()
	c := config.Config{Listen: "127.0.0.1:0", DataDir: directory, AllowHTTPCookie: true}
	address, logs, stop := start(t, c)
	if strings.Contains(logs.String(), "setupToken") {
		t.Fatal("upgrade reinitialized the administrator")
	}
	jar, _ := cookiejar.New(nil)
	origin, _ := url.Parse("http://" + address)
	jar.SetCookies(origin, []*http.Cookie{{Name: "nexa_session", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode}})
	client := lifecycleClient(jar)
	defer client.CloseIdleConnections()
	me := jsonRequest(t, client, address, "GET", "/api/v1/auth/me", "", nil)
	if me["username"] != "owner" || me["csrfToken"] != session.CSRFToken {
		t.Fatal("upgrade invalidated the existing session or CSRF token")
	}
	bootstrap := jsonRequest(t, client, address, "GET", "/api/v1/public/bootstrap", "", nil)
	settings := bootstrap["settings"].(map[string]any)
	if settings["themePreset"] != "future-glass" || settings["customCSS"] != "" || settings["revision"] != float64(42) || settings["accent"] != "#123456" || len(bootstrap["categories"].([]any)) != 0 {
		t.Fatal("upgrade lost existing settings or private view semantics")
	}
	// The category is deliberately unused and stays absent from the launcher.
	response, err := client.Get("http://" + address + "/api/v1/admin/categories")
	if err != nil {
		t.Fatal(err)
	}
	body := readResponse(t, response)
	if response.StatusCode != 200 || !bytes.Contains(body, []byte("Preserved category")) {
		t.Fatal("upgrade lost the private catalog")
	}
	delete(settings, "revision")
	delete(settings, "updatedAt")
	settings["expectedRevision"] = 42
	settings["themePreset"] = "forest"
	settings["customCSS"] = "body { --upgrade-check: 1; }"
	updated := jsonRequest(t, client, address, "PUT", "/api/v1/admin/settings", session.CSRFToken, settings)
	if updated["themePreset"] != "forest" || updated["revision"] != float64(43) {
		t.Fatal("old session could not perform a revision-protected theme mutation")
	}
	if strings.Contains(logs.String(), token) || strings.Contains(logs.String(), session.CSRFToken) || strings.Contains(logs.String(), "A synthetic upgrade test password") {
		t.Fatal("upgrade leaked a credential")
	}
	client.CloseIdleConnections()
	stop()
	snapshotURI := url.URL{Scheme: "file", Path: filepath.Join(directory, "nexa.pre-migration-v1-to-v2.db"), RawQuery: "mode=ro"}
	snapshot, err := sql.Open("sqlite", snapshotURI.String())
	if err != nil {
		t.Fatal(err)
	}
	defer snapshot.Close()
	var version, revision, sessions int
	if err := snapshot.QueryRow("SELECT MAX(version) FROM schema_migrations").Scan(&version); err != nil || version != 1 {
		t.Fatal("pre-upgrade schema was not retained", err)
	}
	if err := snapshot.QueryRow("SELECT revision FROM app_settings").Scan(&revision); err != nil || revision != 42 {
		t.Fatal("recovery point changed after a new mutation", err)
	}
	if err := snapshot.QueryRow("SELECT COUNT(*) FROM admin_sessions").Scan(&sessions); err != nil || sessions != 1 {
		t.Fatal("recovery point omitted the original session", err)
	}
	if err := db.Check(ctx, snapshot); err != nil {
		t.Fatal(err)
	}
}
