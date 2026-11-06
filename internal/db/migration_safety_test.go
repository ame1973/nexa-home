package db

import (
	"bytes"
	"context"
	"database/sql"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

func TestMigrationSnapshotIncludesCommittedWALAndRemainsImmutable(t *testing.T) {
	directory, legacy := legacyThemeDatabase(t)
	if _, err := legacy.Exec("PRAGMA journal_mode=WAL; UPDATE app_settings SET site_title='Latest committed WAL'"); err != nil {
		t.Fatal(err)
	}
	database, err := Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	database.Close()
	path := filepath.Join(directory, "nexa.pre-migration-v1-to-v2.db")
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm() != 0o600 {
		t.Fatal("recovery snapshot must be a private regular file", err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	uri := url.URL{Scheme: "file", Path: path, RawQuery: "mode=ro"}
	snapshot, err := sql.Open("sqlite", uri.String())
	if err != nil {
		t.Fatal(err)
	}
	defer snapshot.Close()
	if err := Check(context.Background(), snapshot); err != nil {
		t.Fatal(err)
	}
	var version, columns int
	var title, hash string
	if err := snapshot.QueryRow("SELECT MAX(version) FROM schema_migrations").Scan(&version); err != nil || version != 1 {
		t.Fatal("snapshot was taken after migration", err)
	}
	if err := snapshot.QueryRow("SELECT COUNT(*) FROM pragma_table_info('app_settings') WHERE name='theme_preset'").Scan(&columns); err != nil || columns != 0 {
		t.Fatal("snapshot contains new columns", err)
	}
	if err := snapshot.QueryRow("SELECT site_title FROM app_settings").Scan(&title); err != nil || title != "Latest committed WAL" {
		t.Fatal("snapshot missed committed WAL data", err)
	}
	if err := snapshot.QueryRow("SELECT password_hash FROM admin_account").Scan(&hash); err != nil || hash != "synthetic-hash" {
		t.Fatal("snapshot lost authentication state", err)
	}
	for _, table := range []string{"admin_sessions", "auth_rate_limits", "audit_log"} {
		var count int
		if err := snapshot.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&count); err != nil || count != 1 {
			t.Fatalf("snapshot lost %s: %v", table, err)
		}
	}
	database, err = Open(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	database.Close()
	after, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(before, after) {
		t.Fatal("normal restart replaced the recovery point", err)
	}
}

func TestExistingMigrationSnapshotFailsClosedWithoutOverwrite(t *testing.T) {
	for _, linked := range []bool{false, true} {
		t.Run(map[bool]string{false: "regular", true: "symlink"}[linked], func(t *testing.T) {
			directory, legacy := legacyThemeDatabase(t)
			path := filepath.Join(directory, "nexa.pre-migration-v1-to-v2.db")
			original := []byte("Existing private recovery point")
			if linked {
				target := filepath.Join(directory, "preserved.db")
				if err := os.WriteFile(target, original, 0o600); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(target, path); err != nil {
					t.Fatal(err)
				}
			} else if err := os.WriteFile(path, original, 0o600); err != nil {
				t.Fatal(err)
			}
			if database, err := Open(context.Background(), directory); err == nil {
				database.Close()
				t.Fatal("overwrote an existing recovery point")
			}
			got, err := os.ReadFile(path)
			if err != nil || !bytes.Equal(got, original) {
				t.Fatal("existing snapshot changed", err)
			}
			var version int
			if err := legacy.QueryRow("SELECT MAX(version) FROM schema_migrations").Scan(&version); err != nil || version != 1 {
				t.Fatal("failed snapshot still migrated the source", err)
			}
		})
	}
}

func TestReadOnlyOpenNeverMigratesInitializesOrWrites(t *testing.T) {
	directory, legacy := legacyThemeDatabase(t)
	legacy.Close()
	path := filepath.Join(directory, "nexa.db")
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	database, err := OpenReadOnly(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec("UPDATE app_settings SET site_title='Must not write'"); err == nil {
		t.Fatal("read-only connection allowed a write")
	}
	if err := Check(context.Background(), database); err != nil {
		t.Fatal(err)
	}
	database.Close()
	after, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(before, after) {
		t.Fatal("read-only check changed the database bytes", err)
	}
	if _, err := os.Stat(filepath.Join(directory, "nexa.pre-migration-v1-to-v2.db")); !os.IsNotExist(err) {
		t.Fatal("read-only check triggered an upgrade snapshot", err)
	}
	missing := filepath.Join(t.TempDir(), "not-created")
	if database, err := OpenReadOnly(context.Background(), missing); err == nil {
		database.Close()
		t.Fatal("read-only open initialized a missing database")
	}
	if _, err := os.Stat(missing); !os.IsNotExist(err) {
		t.Fatal("read-only open created a directory", err)
	}
	empty := t.TempDir()
	if err := os.WriteFile(filepath.Join(empty, "nexa.db"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if database, err := OpenReadOnly(context.Background(), empty); err == nil {
		database.Close()
		t.Fatal("read-only open accepted an uninitialized database")
	}
}

func TestUnsupportedSchemaDoesNotChangeJournalOrCreateSnapshots(t *testing.T) {
	directory, legacy := legacyThemeDatabase(t)
	if _, err := legacy.Exec("UPDATE schema_migrations SET version=?", Version+1); err != nil {
		t.Fatal(err)
	}
	legacy.Close()
	path := filepath.Join(directory, "nexa.db")
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, opener := range []func(context.Context, string) (*sql.DB, error){Open, OpenReadOnly} {
		if database, err := opener(context.Background(), directory); err == nil {
			database.Close()
			t.Fatal("accepted a future schema")
		}
	}
	after, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(before, after) {
		t.Fatal("unsupported schema open changed journal or database bytes", err)
	}
	files, err := filepath.Glob(filepath.Join(directory, "nexa.pre-migration-*.db"))
	if err != nil || len(files) != 0 {
		t.Fatal("unsupported schema created a recovery snapshot", err)
	}
}
