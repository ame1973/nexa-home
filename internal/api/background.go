package api

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"regexp"
	"strconv"

	"nexa-home/internal/assets"
	"nexa-home/internal/auth"
)

var backgroundHash = regexp.MustCompile(`^[a-f0-9]{64}$`)

type backgroundMetadata struct {
	MIME   string
	SHA256 string
	Size   int
	Width  int
	Height int
}

func readBackgroundInfo(ctx context.Context, tx *sql.Tx) (*backgroundMetadata, error) {
	var value backgroundMetadata
	err := tx.QueryRowContext(ctx, "SELECT mime_type,sha256,byte_size,width,height FROM site_background WHERE id=1").Scan(&value.MIME, &value.SHA256, &value.Size, &value.Width, &value.Height)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &value, nil
}

func readBackgroundBytes(ctx context.Context, tx *sql.Tx, info *backgroundMetadata) ([]byte, error) {
	var data []byte
	if err := tx.QueryRowContext(ctx, "SELECT content FROM site_background WHERE id=1").Scan(&data); err != nil {
		return nil, err
	}
	hash := sha256.Sum256(data)
	if len(data) != info.Size || hex.EncodeToString(hash[:]) != info.SHA256 {
		return nil, assets.ErrCorrupt
	}
	return data, nil
}

func writeBackground(ctx context.Context, tx *sql.Tx, value *assets.Background) error {
	if value == nil {
		_, err := tx.ExecContext(ctx, "DELETE FROM site_background WHERE id=1")
		return err
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO site_background(id,mime_type,sha256,byte_size,width,height,content) VALUES(1,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET mime_type=excluded.mime_type,sha256=excluded.sha256,byte_size=excluded.byte_size,width=excluded.width,height=excluded.height,content=excluded.content`, value.MIME, value.SHA256, len(value.Data), value.Width, value.Height, value.Data)
	return err
}

func (s *Server) publicBackground(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
	authenticated, err := s.publicSession(r)
	if err != nil {
		return err
	}
	if !backgroundHash.MatchString(r.PathValue("hash")) {
		return missing()
	}
	var info *backgroundMetadata
	var data []byte
	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		settings, err := readSettings(r.Context(), tx)
		if err != nil {
			return err
		}
		if settings.AccessMode == "private" && !authenticated {
			return auth.ErrUnauthenticated
		}
		info, err = readBackgroundInfo(r.Context(), tx)
		if err != nil {
			return err
		}
		if info == nil || info.SHA256 != r.PathValue("hash") {
			return missing()
		}
		data, err = readBackgroundBytes(r.Context(), tx, info)
		return err
	})
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", info.MIME)
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox; base-uri 'none'; frame-ancestors 'none'")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Disposition", `inline; filename="background"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
	return nil
}
