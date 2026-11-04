// Package db owns SQLite connection and migration lifecycle.
package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"time"

	migrations "nexa-home/db"

	_ "modernc.org/sqlite"
)

const Version = 1

func Open(ctx context.Context, directory string) (*sql.DB, error) {
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}
	path, err := filepath.Abs(filepath.Join(directory, "nexa.db"))
	if err != nil {
		return nil, err
	}
	// Pre-create with restrictive permissions; SQLite preserves the mode on reopen.
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open database file: %w", err)
	}
	if err := file.Close(); err != nil {
		return nil, err
	}
	uri := url.URL{Scheme: "file", Path: path}
	query := url.Values{"_pragma": {"foreign_keys(1)", "busy_timeout(5000)", "journal_mode(WAL)"}, "_txlock": {"immediate"}}
	uri.RawQuery = query.Encode()
	database, err := sql.Open("sqlite", uri.String())
	if err != nil {
		return nil, err
	}
	// ponytail: one connection serializes this single-admin app; add a read pool only after profiling.
	database.SetMaxOpenConns(1)
	database.SetMaxIdleConns(1)
	if err := migrate(ctx, database); err != nil {
		database.Close()
		return nil, fmt.Errorf("migrate database: %w", err)
	}
	return database, nil
}

func migrate(ctx context.Context, database *sql.DB) error {
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var exists bool
	if err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations')").Scan(&exists); err != nil {
		return err
	}
	if exists {
		var version, count int
		if err := tx.QueryRowContext(ctx, "SELECT COALESCE(MAX(version),0),COUNT(*) FROM schema_migrations").Scan(&version, &count); err != nil {
			return err
		}
		if version != Version || count != Version {
			return fmt.Errorf("unsupported schema version %d; expected %d", version, Version)
		}
	} else {
		var tables int
		if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").Scan(&tables); err != nil {
			return err
		}
		if tables != 0 {
			return errors.New("unversioned database is not empty")
		}
		schema, err := migrations.Files.ReadFile("001_init.sql")
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(schema)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func Check(ctx context.Context, database *sql.DB) error {
	var integrity string
	if err := database.QueryRowContext(ctx, "PRAGMA integrity_check").Scan(&integrity); err != nil {
		return err
	}
	if integrity != "ok" {
		return errors.New("database integrity check failed")
	}
	rows, err := database.QueryContext(ctx, "PRAGMA foreign_key_check")
	if err != nil {
		return err
	}
	defer rows.Close()
	if rows.Next() {
		return errors.New("database foreign key check failed")
	}
	return rows.Err()
}

// Snapshot makes a consistent standalone database, including committed WAL data.
// The destination must be a new file; VACUUM INTO never overwrites a backup.
func Snapshot(ctx context.Context, database *sql.DB, destination string) error {
	// SQLite accepts an empty existing file; reserve its mode before writing secrets.
	file, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	if _, err := database.ExecContext(ctx, "VACUUM INTO ?", destination); err != nil {
		file.Close()
		return errors.Join(err, os.Remove(destination))
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return errors.Join(err, os.Remove(destination))
	}
	return file.Close()
}

func Timestamp(now time.Time) string {
	return now.UTC().Format(time.RFC3339Nano)
}
