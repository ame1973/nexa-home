package db

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestTimestampOrdering(t *testing.T) {
	first := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	second := first.Add(time.Nanosecond)
	if Timestamp(first) >= Timestamp(second) {
		t.Fatal("timestamp text order differs from chronological order")
	}
	if _, err := time.Parse(time.RFC3339Nano, Timestamp(second)); err != nil {
		t.Fatal(err)
	}
}

func TestMigrationAndPersistence(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	database, err := Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	for pragma, want := range map[string]int{"foreign_keys": 1, "busy_timeout": 5000} {
		var got int
		if err := database.QueryRow("PRAGMA " + pragma).Scan(&got); err != nil || got != want {
			t.Fatalf("%s = %d, %v", pragma, got, err)
		}
	}
	var journal string
	if err := database.QueryRow("PRAGMA journal_mode").Scan(&journal); err != nil || journal != "wal" {
		t.Fatalf("journal = %s, %v", journal, err)
	}
	var count int
	if err := database.QueryRow("SELECT COUNT(*) FROM admin_account").Scan(&count); err != nil || count != 0 {
		t.Fatalf("default credentials exist: %d, %v", count, err)
	}
	if _, err := database.Exec("UPDATE app_settings SET site_title='Persistent'"); err != nil {
		t.Fatal(err)
	}
	if err := Check(ctx, database); err != nil {
		t.Fatal(err)
	}
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}
	database, err = Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	var title string
	if err := database.QueryRow("SELECT site_title FROM app_settings").Scan(&title); err != nil || title != "Persistent" {
		t.Fatalf("lost persisted settings: %q, %v", title, err)
	}
	if _, err := database.Exec("INSERT INTO service_tags(service_id,tag_id) VALUES('missing','missing')"); err == nil {
		t.Fatal("foreign keys disabled after reopen")
	}
	info, err := os.Stat(filepath.Join(directory, "nexa.db"))
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("insecure database permissions: %v, %v", info, err)
	}
}

func TestUnknownVersionFailsWithoutMutation(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	database, err := Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec("INSERT INTO schema_migrations(version,applied_at) VALUES(2,'future')"); err != nil {
		t.Fatal(err)
	}
	database.Close()
	if database, err := Open(ctx, directory); err == nil {
		database.Close()
		t.Fatal("accepted a future database")
	}
}

func TestSnapshot(t *testing.T) {
	ctx := context.Background()
	database, err := Open(ctx, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	destination := filepath.Join(t.TempDir(), "snapshot.db")
	if err := Snapshot(ctx, database, destination); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(destination)
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("snapshot permissions: %v, %v", info, err)
	}
	if err := Snapshot(ctx, database, destination); err == nil {
		t.Fatal("overwrote existing snapshot")
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	failed := filepath.Join(t.TempDir(), "failed.db")
	if err := Snapshot(cancelled, database, failed); err == nil {
		t.Fatal("snapshot succeeded with cancelled context")
	}
	if _, err := os.Stat(failed); !os.IsNotExist(err) {
		t.Fatalf("partial snapshot was not removed: %v", err)
	}
	copy, err := sql.Open("sqlite", destination)
	if err != nil {
		t.Fatal(err)
	}
	defer copy.Close()
	if err := Check(ctx, copy); err != nil {
		t.Fatal(err)
	}
}

func TestBusyWriterAndMigrationRace(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	first, err := Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := Open(ctx, directory)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	tx, err := first.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		_, err := second.ExecContext(ctx, "UPDATE app_settings SET revision=revision+1")
		done <- err
	}()
	select {
	case err := <-done:
		t.Fatalf("writer did not wait: %v", err)
	case <-time.After(30 * time.Millisecond):
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if err := Check(ctx, second); err != nil {
		t.Fatal(err)
	}
}
