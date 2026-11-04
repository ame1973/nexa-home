//go:build linux

// Package lifecycle owns Linux data-directory permissions and exclusive ownership.
package lifecycle

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/unix"
)

// Lock must be held before opening SQLite, migrating, or collecting icon files.
// The inode is never removed: unlinking a live lock permits two separate owners.
type Lock struct{ file *os.File }

func Acquire(directory string) (*Lock, error) {
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}
	if err := privatePath(directory, true); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(filepath.Join(directory, ".nexa.lock"), os.O_CREATE|os.O_RDWR|unix.O_NOFOLLOW, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open data lock: %w", err)
	}
	fail := func(err error) (*Lock, error) { return nil, errors.Join(err, file.Close()) }
	info, err := file.Stat()
	if err != nil {
		return fail(err)
	}
	stat := new(unix.Stat_t)
	if err := unix.Fstat(int(file.Fd()), stat); err != nil {
		return fail(err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 || stat.Uid != uint32(os.Geteuid()) || stat.Nlink != 1 {
		return fail(errors.New("data lock must be a private, singly-linked regular file owned by the process user"))
	}
	if err := unix.Flock(int(file.Fd()), unix.LOCK_EX|unix.LOCK_NB); err != nil {
		return fail(fmt.Errorf("data directory is already owned by another process or does not support local file locks: %w", err))
	}
	for _, name := range []string{"nexa.db", "nexa.db-wal", "nexa.db-shm", "assets"} {
		path := filepath.Join(directory, name)
		if _, err := os.Lstat(path); errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err := privatePath(path, name == "assets"); err != nil {
			return fail(err)
		}
	}
	return &Lock{file: file}, nil
}

func privatePath(path string, directory bool) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	stat := new(unix.Stat_t)
	if err := unix.Lstat(path, stat); err != nil {
		return err
	}
	if (directory && !info.IsDir()) || (!directory && !info.Mode().IsRegular()) || info.Mode().Perm()&0o077 != 0 || stat.Uid != uint32(os.Geteuid()) {
		return fmt.Errorf("%s must be owned by UID %d with no group/other permissions (0700 directory / 0600 regular file); symlinks are not allowed", path, os.Geteuid())
	}
	return nil
}

func (lock *Lock) Close() error { return lock.file.Close() }
