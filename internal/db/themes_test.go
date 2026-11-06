package db

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	migrations "nexa-home/db"
)

func legacyThemeDatabase(t *testing.T) (string, *sql.DB) {
	t.Helper()
	directory := t.TempDir()
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
	if _, err := database.Exec(`UPDATE app_settings SET site_title='Existing home',theme='light',accent='#123456',card_density='compact',glass_enabled=0,revision=42;
	INSERT INTO admin_account VALUES(1,'existing-admin','synthetic-hash','stamp','stamp','stamp');
	INSERT INTO admin_sessions(id_hash,created_at,last_seen_at,expires_at,csrf_secret_hash) VALUES('synthetic-session','a','a','z','synthetic-csrf');
	INSERT INTO auth_rate_limits(key_hash,window_started_at) VALUES('existing-rate','stamp');
	INSERT INTO audit_log(id,occurred_at,action) VALUES('existing-audit','stamp','setup');`); err != nil {
		t.Fatal(err)
	}
	return directory, database
}

func TestThemeMigrationPreservesLegacyStateAndIsIdempotent(t *testing.T) {
	directory, old := legacyThemeDatabase(t)
	old.Close()
	for range 2 {
		database, err := Open(context.Background(), directory)
		if err != nil {
			t.Fatal(err)
		}
		var title, mode, accent, density, preset, theme, css string
		var glass bool
		var revision, migrations int
		if err := database.QueryRow(`SELECT site_title,theme,accent,card_density,glass_enabled,revision,theme_preset,custom_theme,custom_css FROM app_settings`).Scan(&title, &mode, &accent, &density, &glass, &revision, &preset, &theme, &css); err != nil {
			t.Fatal(err)
		}
		if title != "Existing home" || mode != "light" || accent != "#123456" || density != "compact" || glass || revision != 42 || preset != "future-glass" || theme != "null" || css != "" {
			t.Fatal("migration changed existing presentation or failed to initialize theme defaults")
		}
		for _, table := range []string{"admin_account", "admin_sessions", "auth_rate_limits", "audit_log"} {
			var count int
			if err := database.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&count); err != nil || count != 1 {
				t.Fatalf("migration changed %s: %v", table, err)
			}
		}
		if err := database.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&migrations); err != nil || migrations != Version {
			t.Fatal("migration did not run exactly once", err)
		}
		database.Close()
	}
}

func TestFailedThemeMigrationRollsBackEveryAlter(t *testing.T) {
	directory, old := legacyThemeDatabase(t)
	if _, err := old.Exec("ALTER TABLE app_settings ADD COLUMN custom_css TEXT"); err != nil {
		t.Fatal(err)
	}
	if database, err := Open(context.Background(), directory); err == nil {
		database.Close()
		t.Fatal("accepted a conflicting partial schema")
	}
	var columns, version int
	if err := old.QueryRow("SELECT COUNT(*) FROM pragma_table_info('app_settings') WHERE name IN ('theme_preset','custom_theme')").Scan(&columns); err != nil || columns != 0 {
		t.Fatal("failed migration left a partial ALTER", err)
	}
	if err := old.QueryRow("SELECT MAX(version) FROM schema_migrations").Scan(&version); err != nil || version != 1 {
		t.Fatal("failed migration advanced the version", err)
	}
}

func TestThemeMigrationRejectsGappedOrInvalidHistory(t *testing.T) {
	for _, history := range []string{"DELETE FROM schema_migrations", "UPDATE schema_migrations SET version=2", "INSERT INTO schema_migrations VALUES(0,'invalid')"} {
		t.Run(history, func(t *testing.T) {
			directory, old := legacyThemeDatabase(t)
			if _, err := old.Exec(history); err != nil {
				t.Fatal(err)
			}
			if database, err := Open(context.Background(), directory); err == nil {
				database.Close()
				t.Fatal("accepted invalid migration history")
			}
			var columns int
			if err := old.QueryRow("SELECT COUNT(*) FROM pragma_table_info('app_settings') WHERE name='theme_preset'").Scan(&columns); err != nil || columns != 0 {
				t.Fatal("unsupported history mutated schema", err)
			}
		})
	}
}
