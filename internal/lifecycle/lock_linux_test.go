//go:build linux

package lifecycle

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func privateDirectory(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "private")
	if err := os.Mkdir(path, 0o700); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestExclusiveDirectoryOwnershipAndRecovery(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "data")
	first, err := Acquire(directory)
	if err != nil {
		t.Fatal(err)
	}
	if second, err := Acquire(directory); err == nil {
		second.Close()
		t.Fatal("second writer acquired the data directory")
	}
	info, err := os.Stat(filepath.Join(directory, ".nexa.lock"))
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("private lock: %v %v", info, err)
	}
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(directory, ".nexa.lock")); err != nil {
		t.Fatal("lock inode was removed", err)
	}
	reopened, err := Acquire(directory)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
}

func TestConcurrentDirectoryAcquisition(t *testing.T) {
	directory := privateDirectory(t)
	var wait sync.WaitGroup
	locks := make(chan *Lock, 8)
	for range 8 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			if lock, err := Acquire(directory); err == nil {
				locks <- lock
			} else {
				t.Log(err)
			}
		}()
	}
	wait.Wait()
	close(locks)
	count := 0
	for lock := range locks {
		count++
		lock.Close()
	}
	if count != 1 {
		t.Fatalf("owners = %d, expected exactly one", count)
	}
}

func TestRejectsInsecureDataPathsWithoutChangingThem(t *testing.T) {
	for _, name := range []string{"directory", ".nexa.lock", "nexa.db", "nexa.db-wal", "nexa.db-shm", "assets"} {
		t.Run(name, func(t *testing.T) {
			directory := privateDirectory(t)
			path := directory
			if name != "directory" {
				path = filepath.Join(directory, name)
				if name == "assets" {
					if err := os.Mkdir(path, 0o700); err != nil {
						t.Fatal(err)
					}
				} else if err := os.WriteFile(path, []byte("unchanged"), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			if err := os.Chmod(path, 0o755); err != nil {
				t.Fatal(err)
			}
			if lock, err := Acquire(directory); err == nil {
				lock.Close()
				t.Fatal("accepted group/other accessible data")
			} else if name != ".nexa.lock" && !strings.Contains(err.Error(), path) {
				t.Fatalf("rejected the wrong path: %v", err)
			}
			info, _ := os.Stat(path)
			if info.Mode().Perm() != 0o755 {
				t.Fatal("startup changed existing permissions")
			}
			if name != "directory" && name != "assets" {
				content, _ := os.ReadFile(path)
				if string(content) != "unchanged" {
					t.Fatal("startup modified existing contents")
				}
			}
		})
	}
}

func TestRejectsSymlinksAndLinkedLock(t *testing.T) {
	for _, name := range []string{"directory", ".nexa.lock", "nexa.db", "assets"} {
		t.Run(name, func(t *testing.T) {
			directory := privateDirectory(t)
			outside := t.TempDir()
			target := filepath.Join(outside, "target")
			if err := os.WriteFile(target, []byte("untouched"), 0o600); err != nil {
				t.Fatal(err)
			}
			if name == "directory" {
				alias := filepath.Join(directory, "alias")
				if err := os.Symlink(outside, alias); err != nil {
					t.Fatal(err)
				}
				directory = alias
			} else if err := os.Symlink(target, filepath.Join(directory, name)); err != nil {
				t.Fatal(err)
			}
			if lock, err := Acquire(directory); err == nil {
				lock.Close()
				t.Fatal("accepted symlink")
			}
			content, _ := os.ReadFile(target)
			if string(content) != "untouched" {
				t.Fatal("followed or modified a symlink target")
			}
		})
	}
	directory := privateDirectory(t)
	target := filepath.Join(directory, "original")
	if err := os.WriteFile(target, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(target, filepath.Join(directory, ".nexa.lock")); err != nil {
		t.Fatal(err)
	}
	if lock, err := Acquire(directory); err == nil {
		lock.Close()
		t.Fatal("accepted multiply-linked lock inode")
	}
}
