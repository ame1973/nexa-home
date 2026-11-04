package assets

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"io/fs"
	"os"
	"path"
	"regexp"

	"github.com/google/uuid"
)

var contentPath = regexp.MustCompile(`^([a-f0-9]{2})/([a-f0-9]{64})\.(png|webp|svg)$`)
var temporaryPath = regexp.MustCompile(`^[a-f0-9]{2}/\.[a-f0-9-]{36}\.tmp$`)

type Store struct{ root *os.Root }

func Open(dataDirectory string) (*Store, error) {
	data, err := os.OpenRoot(dataDirectory)
	if err != nil {
		return nil, err
	}
	defer data.Close()
	if err := data.Mkdir("assets", 0o700); err != nil && !errors.Is(err, fs.ErrExist) {
		return nil, err
	}
	parent, err := data.Open(".")
	if err != nil {
		return nil, err
	}
	err = parent.Sync()
	parent.Close()
	if err != nil {
		return nil, err
	}
	root, err := data.OpenRoot("assets")
	if err != nil {
		return nil, err
	}
	return &Store{root: root}, nil
}
func (s *Store) Close() error { return s.root.Close() }

func validPath(name string) bool {
	parts := contentPath.FindStringSubmatch(name)
	return parts != nil && parts[1] == parts[2][:2]
}

// Put publishes an fsynced temporary file with an atomic no-overwrite hard link.
// The caller serializes asset mutations through the matching metadata transaction.
// created identifies only new files, allowing safe cleanup after transaction failure.
func (s *Store) Put(image Image) (created bool, err error) {
	if len(image.SHA256) != 64 || len(image.Data) == 0 || len(image.Data) > MaxBytes {
		return false, ErrInvalid
	}
	name := image.Path()
	if !validPath(name) {
		return false, ErrInvalid
	}
	hash := sha256.Sum256(image.Data)
	if hex.EncodeToString(hash[:]) != image.SHA256 {
		return false, ErrCorrupt
	}
	if existing, err := s.Read(name, image.SHA256, len(image.Data)); err == nil {
		if !bytes.Equal(existing, image.Data) {
			return false, ErrCorrupt
		}
		return false, nil
	} else if !errors.Is(err, fs.ErrNotExist) {
		return false, err
	}
	directory := path.Dir(name)
	if err := s.root.MkdirAll(directory, 0o700); err != nil {
		return false, err
	}
	temporary := directory + "/." + uuid.NewString() + ".tmp"
	file, err := s.root.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return false, err
	}
	defer func() { file.Close(); _ = s.root.Remove(temporary) }()
	if _, err := file.Write(image.Data); err != nil {
		return false, err
	}
	if err := file.Sync(); err != nil {
		return false, err
	}
	if err := file.Close(); err != nil {
		return false, err
	}
	if err := s.root.Link(temporary, name); err != nil {
		if errors.Is(err, fs.ErrExist) {
			_, err = s.Read(name, image.SHA256, len(image.Data))
			return false, err
		}
		return false, err
	}
	if err := s.syncDirectory(directory); err != nil {
		return false, errors.Join(err, s.root.Remove(name))
	}
	if err := s.syncDirectory("."); err != nil {
		return false, errors.Join(err, s.root.Remove(name))
	}
	return true, nil
}

func (s *Store) syncDirectory(name string) error {
	directory, err := s.root.Open(name)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}

func (s *Store) Read(name, expectedHash string, expectedSize int) ([]byte, error) {
	if !validPath(name) || path.Base(name) != expectedHash+path.Ext(name) || expectedSize < 1 || expectedSize > MaxBytes {
		return nil, ErrCorrupt
	}
	file, err := s.root.Open(name)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() != int64(expectedSize) {
		return nil, ErrCorrupt
	}
	data, err := io.ReadAll(io.LimitReader(file, MaxBytes+1))
	if err != nil {
		return nil, err
	}
	hash := sha256.Sum256(data)
	if len(data) != expectedSize || hex.EncodeToString(hash[:]) != expectedHash {
		return nil, ErrCorrupt
	}
	return data, nil
}

func (s *Store) Remove(name string) error {
	if !validPath(name) {
		return ErrInvalid
	}
	err := s.root.Remove(name)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	return s.syncDirectory(path.Dir(name))
}

// Collect removes only recognized app-generated files; unknown files are untouched.
// Call before serving traffic or while the caller holds the asset mutation lock.
func (s *Store) Collect(keep map[string]bool) error {
	return fs.WalkDir(s.root.FS(), ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || keep[name] {
			return nil
		}
		if validPath(name) || temporaryPath.MatchString(name) {
			if err := s.root.Remove(name); err != nil && !errors.Is(err, fs.ErrNotExist) {
				return err
			}
		}
		return nil
	})
}
