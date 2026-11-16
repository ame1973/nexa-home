package db

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"path/filepath"
	"testing"

	migrations "nexa-home/db"
)

func TestAppearanceMigrationPreservesExistingLayoutsAndSnapshot(t *testing.T) {
	for _, preset := range []string{"future-glass", "graphite", "tide", "forest", "dune", "custom"} {
		t.Run(preset, func(t *testing.T) {
			directory, legacy := legacyThemeDatabase(t)
			for _, name := range []string{"002_themes.sql", "003_service_health.sql"} {
				schema, err := migrations.Files.ReadFile(name)
				if err != nil {
					t.Fatal(err)
				}
				if _, err := legacy.Exec(string(schema)); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := legacy.Exec("UPDATE app_settings SET theme_preset=?", preset); err != nil {
				t.Fatal(err)
			}
			legacy.Close()
			database, err := Open(context.Background(), directory)
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			want := preset
			if want == "custom" {
				want = "future-glass"
			}
			var palette, layout string
			var revision, backgrounds int
			if err := database.QueryRow("SELECT theme_preset,layout_preset,revision,(SELECT COUNT(*) FROM site_background) FROM app_settings").Scan(&palette, &layout, &revision, &backgrounds); err != nil || palette != preset || layout != want || revision != 42 || backgrounds != 0 {
				t.Fatalf("migration changed saved appearance: palette=%s layout=%s revision=%d backgrounds=%d: %v", palette, layout, revision, backgrounds, err)
			}
			if _, err := database.Exec("UPDATE app_settings SET layout_preset='remote'"); err == nil {
				t.Fatal("invalid layout accepted")
			}
			uri := url.URL{Scheme: "file", Path: filepath.Join(directory, "nexa.pre-migration-v3-to-v4.db"), RawQuery: "mode=ro"}
			snapshot, err := sql.Open("sqlite", uri.String())
			if err != nil {
				t.Fatal(err)
			}
			defer snapshot.Close()
			var version, sessions int
			if err := snapshot.QueryRow("SELECT MAX(version),(SELECT COUNT(*) FROM admin_sessions) FROM schema_migrations").Scan(&version, &sessions); err != nil || version != 3 || sessions != 1 {
				t.Fatal("pre-upgrade snapshot lost schema or session", err)
			}
		})
	}
}

func TestBackgroundSchemaEnforcesBounds(t *testing.T) {
	directory, old := legacyThemeDatabase(t)
	old.Close()
	database, err := Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	for _, statement := range []string{
		"INSERT INTO site_background VALUES(2,'image/png','" + fmt.Sprintf("%064d", 1) + "',1,1,1,x'00')",
		"INSERT INTO site_background VALUES(1,'image/svg+xml','" + fmt.Sprintf("%064d", 1) + "',1,1,1,x'00')",
		"INSERT INTO site_background VALUES(1,'image/png','bad',1,1,1,x'00')",
		"INSERT INTO site_background VALUES(1,'image/png','" + fmt.Sprintf("%064d", 1) + "',2,1,1,x'00')",
		"INSERT INTO site_background VALUES(1,'image/png','" + fmt.Sprintf("%064d", 1) + "',1,4096,2161,x'00')",
	} {
		if _, err := database.Exec(statement); err == nil {
			t.Fatal("invalid background metadata accepted")
		}
	}
}
