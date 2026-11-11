package api

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

	"nexa-home/internal/assets"
	"nexa-home/internal/auth"
	"nexa-home/internal/db"

	"github.com/google/uuid"
)

const MaxAssets = 1024

type Asset struct {
	ID       string `json:"id"`
	MIME     string `json:"mimeType"`
	ByteSize int    `json:"byteSize"`
	URL      string `json:"url"`
}

type storedAsset struct {
	Asset
	Kind   string
	SHA256 string
	Path   string
}

type rowScanner interface{ Scan(...any) error }

func scanAsset(row rowScanner) (storedAsset, error) {
	var value storedAsset
	if err := row.Scan(&value.ID, &value.MIME, &value.ByteSize, &value.Kind, &value.SHA256, &value.Path); err != nil {
		return value, err
	}
	expectedMIME := map[string]string{"png": "image/png", "webp": "image/webp", "svg": "image/svg+xml"}[value.Kind]
	if len(value.SHA256) != 64 || expectedMIME == "" || value.MIME != expectedMIME || value.Path != value.SHA256[:2]+"/"+value.SHA256+"."+value.Kind {
		return value, assets.ErrCorrupt
	}
	value.URL = "/assets/" + value.ID
	return value, nil
}

const assetColumns = "id,mime_type,byte_size,kind,sha256,relative_path"

func readAssets(ctx context.Context, tx *sql.Tx) ([]storedAsset, error) {
	rows, err := tx.QueryContext(ctx, "SELECT "+assetColumns+" FROM icon_assets ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := make([]storedAsset, 0)
	for rows.Next() {
		value, err := scanAsset(rows)
		if err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, rows.Err()
}

func (s *Server) collectAssets(ctx context.Context) error {
	rows, err := s.database.QueryContext(ctx, "SELECT relative_path FROM icon_assets")
	if err != nil {
		return err
	}
	keep := make(map[string]bool)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return err
		}
		keep[name] = true
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	return s.assets.Collect(keep)
}

func (s *Server) assetRoutes() {
	s.route("POST", "/api/v1/admin/assets", true, s.uploadAsset)
	s.route("DELETE", "/api/v1/admin/assets/{id}", true, s.deleteAsset)
	s.route("GET", "/assets/{id}", false, s.serveAsset)
}

func (s *Server) uploadAsset(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
	if encoding := r.Header.Get("Content-Encoding"); encoding != "" && encoding != "identity" {
		return invalid("file", "Compressed request bodies are not supported")
	}
	r.Body = http.MaxBytesReader(w, r.Body, assets.MaxBytes+(64<<10))
	multipart, err := r.MultipartReader()
	if err != nil {
		return invalid("file", "Expected multipart/form-data with one file")
	}
	part, err := multipart.NextPart()
	if err != nil {
		return multipartError(err)
	}
	defer part.Close()
	_, parameters, err := mime.ParseMediaType(part.Header.Get("Content-Disposition"))
	filename := parameters["filename"]
	if err != nil || part.FormName() != "file" || filename == "" || len(filename) > 255 || strings.ContainsAny(filename, "/\\") || strings.IndexFunc(filename, unicode.IsControl) >= 0 {
		return invalid("file", "Provide one file with a plain filename")
	}
	data, err := io.ReadAll(io.LimitReader(part, assets.MaxBytes+1))
	if err != nil {
		return multipartError(err)
	}
	if len(data) > assets.MaxBytes {
		return assets.ErrTooLarge
	}
	if _, err := multipart.NextPart(); err != io.EOF {
		if err != nil {
			return multipartError(err)
		}
		return invalid("file", "Only the file field is accepted")
	}
	image, err := assets.ValidateUpload(data)
	if err != nil {
		return err
	}
	// ponytail: one admin serializes icon writes through commit/cleanup; use per-hash
	// locks only if measured upload throughput requires concurrent publication.
	s.assetMu.Lock()
	defer s.assetMu.Unlock()
	created, err := s.assets.Put(image)
	if err != nil {
		return err
	}
	var result Asset
	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		existing, err := scanAsset(tx.QueryRowContext(r.Context(), "SELECT "+assetColumns+" FROM icon_assets WHERE sha256=?", image.SHA256))
		if err == nil {
			if existing.MIME != image.MIME || existing.ByteSize != len(image.Data) {
				return assets.ErrCorrupt
			}
			result = existing.Asset
		} else {
			if !errors.Is(err, sql.ErrNoRows) {
				return err
			}
			var count int
			if err := tx.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM icon_assets").Scan(&count); err != nil {
				return err
			}
			if count >= MaxAssets {
				return &problem{status: 409, code: "LIMIT_EXCEEDED", message: "The 1024-icon limit has been reached"}
			}
			result = Asset{ID: uuid.NewString(), MIME: image.MIME, ByteSize: len(image.Data)}
			result.URL = "/assets/" + result.ID
			if err := insertAsset(r.Context(), tx, result.ID, image, time.Now()); err != nil {
				return err
			}
		}
		if err := s.ensurePortable(r.Context(), tx); err != nil {
			return err
		}
		return db.Audit(r.Context(), tx, time.Now(), "asset.upload", "asset", result.ID)
	})
	if err != nil {
		if created {
			if cleanupError := s.discardStaged(r.Context(), image.Path()); cleanupError != nil {
				return cleanupError
			}
		}
		return err
	}
	return jsonResponse(w, 201, result)
}

// Cleanup failures are operational errors, never hidden by an earlier SQL conflict.
func (s *Server) discardStaged(ctx context.Context, names ...string) error {
	var failure error
	for _, name := range names {
		failure = errors.Join(failure, s.assets.Remove(name))
	}
	if failure != nil {
		s.logger.WarnContext(ctx, "deferred staged icon cleanup")
	}
	return failure
}

func multipartError(err error) error {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		return err
	}
	return invalid("file", "Malformed multipart upload")
}

func insertAsset(ctx context.Context, tx *sql.Tx, id string, image assets.Image, now time.Time) error {
	var width, height any
	if image.Width > 0 {
		width = image.Width
		height = image.Height
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO icon_assets(id,kind,mime_type,sha256,relative_path,byte_size,width,height,created_at) VALUES(?,?,?,?,?,?,?,?,?)`, id, image.Kind, image.MIME, image.SHA256, image.Path(), len(image.Data), width, height, db.Timestamp(now))
	return err
}

func (s *Server) deleteAsset(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
	s.assetMu.Lock()
	defer s.assetMu.Unlock()
	var value storedAsset
	err := s.mutate(r, "asset.delete", "asset", r.PathValue("id"), func(tx *sql.Tx) error {
		var err error
		value, err = scanAsset(tx.QueryRowContext(r.Context(), "SELECT "+assetColumns+" FROM icon_assets WHERE id=?", r.PathValue("id")))
		if err != nil {
			return err
		}
		return changed(tx.ExecContext(r.Context(), "DELETE FROM icon_assets WHERE id=?", value.ID))
	})
	if err != nil {
		return err
	}
	// Metadata is already committed. A failed unlink is harmless orphan data and
	// is collected at the next startup, never reported as a rolled-back deletion.
	if err := s.assets.Remove(value.Path); err != nil {
		s.logger.WarnContext(r.Context(), "deferred orphan icon cleanup")
	}
	w.WriteHeader(204)
	return nil
}

func (s *Server) serveAsset(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
	_, sessionError := s.session(r)
	if sessionError != nil && !errors.Is(sessionError, auth.ErrUnauthenticated) {
		return sessionError
	}
	var value storedAsset
	var data []byte
	err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		var initialized bool
		if err := tx.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM admin_account WHERE id=1)").Scan(&initialized); err != nil {
			return err
		}
		if !initialized {
			return &problem{status: 403, code: "FORBIDDEN", message: "Complete protected setup before accessing icons"}
		}
		settings, err := readSettings(r.Context(), tx)
		if err != nil {
			return err
		}
		if sessionError != nil {
			if settings.AccessMode == "private" {
				return auth.ErrUnauthenticated
			}
			var visible bool
			if err := tx.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM services s LEFT JOIN categories c ON c.id=s.category_id WHERE s.icon_asset_id=? AND s.is_visible=1 AND (s.category_id IS NULL OR c.is_visible=1))`, r.PathValue("id")).Scan(&visible); err != nil {
				return err
			}
			if !visible {
				return missing()
			}
		}
		value, err = scanAsset(tx.QueryRowContext(r.Context(), "SELECT "+assetColumns+" FROM icon_assets WHERE id=?", r.PathValue("id")))
		if err != nil {
			return err
		}
		data, err = s.assets.Read(value.Path, value.SHA256, value.ByteSize)
		return err
	})
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", value.MIME)
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox; base-uri 'none'; frame-ancestors 'none'")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
	w.Header().Set("Content-Disposition", `inline; filename="icon.`+value.Kind+`"`)
	w.WriteHeader(200)
	_, _ = w.Write(data)
	return nil
}
