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

const Version = 2

func Open(ctx context.Context, directory string) (*sql.DB, error) {
	return open(ctx, directory, false)
}

// OpenReadOnly checks an existing supported schema without creating or migrating it.
// The caller still holds the normal data-directory lock during offline checks.
func OpenReadOnly(ctx context.Context, directory string) (*sql.DB, error) {
	return open(ctx, directory, true)
}

func open(ctx context.Context, directory string, readOnly bool) (*sql.DB, error) {
	if !readOnly {
		if err := os.MkdirAll(directory, 0o700); err != nil {
			return nil, fmt.Errorf("create data directory: %w", err)
		}
	}
	path, err := filepath.Abs(filepath.Join(directory, "nexa.db"))
	if err != nil {
		return nil, err
	}
	if !readOnly {
		// Pre-create privately; SQLite preserves the mode on reopen.
		file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
		if err != nil {
			return nil, fmt.Errorf("open database file: %w", err)
		}
		if err := file.Close(); err != nil {
			return nil, err
		}
	}
	uri := url.URL{Scheme: "file", Path: path}
	query := url.Values{"_pragma": {"foreign_keys(1)", "busy_timeout(5000)"}}
	if readOnly {
		query.Set("mode", "ro")
	} else {
		query.Set("_txlock", "immediate")
	}
	uri.RawQuery = query.Encode()
	database, err := sql.Open("sqlite", uri.String())
	if err != nil {
		return nil, err
	}
	// ponytail: one connection serializes this single-admin app; add a read pool only after profiling.
	database.SetMaxOpenConns(1)
	database.SetMaxIdleConns(1)
	version, err := schemaVersion(ctx, database)
	if err == nil && readOnly && version == 0 {
		err = errors.New("database is not initialized")
	}
	if err == nil && !readOnly && version > 0 && version < Version {
		// Never overwrite an earlier recovery point or accumulate snapshots on
		// restart after a failed migration. Preserve/move an existing file first.
		destination := filepath.Join(directory, fmt.Sprintf("nexa.pre-migration-v%d-to-v%d.db", version, Version))
		err = Snapshot(ctx, database, destination)
	}
	if err == nil && !readOnly {
		_, err = database.ExecContext(ctx, "PRAGMA journal_mode=WAL")
	}
	if err == nil && !readOnly {
		err = migrate(ctx, database)
	}
	if err != nil {
		database.Close()
		return nil, fmt.Errorf("check or migrate database: %w", err)
	}
	return database, nil
}

func migrate(ctx context.Context, database *sql.DB) error {
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	version, err := schemaVersion(ctx, tx)
	if err != nil {
		return err
	}
	for _, name := range []string{"001_init.sql", "002_themes.sql"}[version:] {
		schema, err := migrations.Files.ReadFile(name)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(schema)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Both the preflight connection and the migration transaction use identical checks.
type schemaReader interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func schemaVersion(ctx context.Context, reader schemaReader) (int, error) {
	var exists bool
	if err := reader.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations')").Scan(&exists); err != nil {
		return 0, err
	}
	if !exists {
		var tables int
		if err := reader.QueryRowContext(ctx, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").Scan(&tables); err != nil {
			return 0, err
		}
		if tables != 0 {
			return 0, errors.New("unversioned database is not empty")
		}
		return 0, nil
	}
	var version, count, first int
	if err := reader.QueryRowContext(ctx, "SELECT COALESCE(MAX(version),0),COUNT(*),COALESCE(MIN(version),0) FROM schema_migrations").Scan(&version, &count, &first); err != nil {
		return 0, err
	}
	if version < 1 || version > Version || count != version || first != 1 {
		return 0, fmt.Errorf("unsupported schema version %d; expected a contiguous history through %d", version, Version)
	}
	return version, nil
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
	if err := file.Close(); err != nil {
		return err
	}
	directory, err := os.Open(filepath.Dir(destination))
	if err != nil {
		return err
	}
	return errors.Join(directory.Sync(), directory.Close())
}

func Timestamp(now time.Time) string {
	// Fixed precision preserves chronological ordering in SQLite TEXT comparisons.
	return now.UTC().Format("2006-01-02T15:04:05.000000000Z")
}
