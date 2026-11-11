package db

import (
	"context"
	"database/sql"
	"net/url"
	"path/filepath"
	"testing"

	migrations "nexa-home/db"
)

func TestHealthMigrationPreservesVersionTwoAndEnforcesConstraints(t *testing.T) {
	directory, legacy := legacyThemeDatabase(t)
	schema, err := migrations.Files.ReadFile("002_themes.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := legacy.Exec(string(schema)); err != nil {
		t.Fatal(err)
	}
	if _, err := legacy.Exec(`INSERT INTO services(id,name,icon_kind,created_at,updated_at) VALUES('service','Existing','lucide','stamp','stamp')`); err != nil {
		t.Fatal(err)
	}
	legacy.Close()

	database, err := Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	var count int
	if err := database.QueryRow("SELECT COUNT(*) FROM service_health_checks").Scan(&count); err != nil || count != 0 {
		t.Fatal("existing services must not be monitored automatically", err)
	}
	for _, interval := range []any{29, 86401, 30.5} {
		if _, err := database.Exec("INSERT INTO service_health_checks VALUES('service','http://example.test',?)", interval); err == nil {
			t.Fatalf("accepted invalid interval %v", interval)
		}
	}
	if _, err := database.Exec("INSERT INTO service_health_checks VALUES('service','short',60)"); err == nil {
		t.Fatal("accepted an invalid URL length")
	}
	if _, err := database.Exec("INSERT INTO service_health_checks VALUES('service','http://example.test',60)"); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec("DELETE FROM services WHERE id='service'"); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRow("SELECT COUNT(*) FROM service_health_checks").Scan(&count); err != nil || count != 0 {
		t.Fatal("deleting a service must delete its check", err)
	}

	uri := url.URL{Scheme: "file", Path: filepath.Join(directory, "nexa.pre-migration-v2-to-v3.db"), RawQuery: "mode=ro"}
	snapshot, err := sql.Open("sqlite", uri.String())
	if err != nil {
		t.Fatal(err)
	}
	defer snapshot.Close()
	var version, sessions, services int
	if err := snapshot.QueryRow("SELECT MAX(version) FROM schema_migrations").Scan(&version); err != nil || version != 2 {
		t.Fatal("snapshot did not preserve the pre-upgrade schema", err)
	}
	if err := snapshot.QueryRow("SELECT COUNT(*) FROM admin_sessions").Scan(&sessions); err != nil || sessions != 1 {
		t.Fatal("snapshot lost existing sessions", err)
	}
	if err := snapshot.QueryRow("SELECT COUNT(*) FROM services").Scan(&services); err != nil || services != 1 {
		t.Fatal("snapshot lost the existing service", err)
	}
}
