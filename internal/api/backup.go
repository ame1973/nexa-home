package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"nexa-home/internal/assets"
	"nexa-home/internal/auth"
	"nexa-home/internal/db"
)

const (
	MaxBackupBytes    = 16 << 20
	MaxCatalogEntries = 5000
	MaxPosition       = 1<<31 - 1
	MaxPendingImports = 2
	ImportLifetime    = 5 * time.Minute
)

type BackupAsset struct {
	ID     string `json:"id"`
	MIME   string `json:"mimeType"`
	Base64 string `json:"base64"`
}
type Backup struct {
	Format     string        `json:"format"`
	Version    int           `json:"version"`
	ExportedAt string        `json:"exportedAt"`
	Settings   Settings      `json:"settings"`
	Categories []Category    `json:"categories"`
	Services   []Service     `json:"services"`
	Tags       []Tag         `json:"tags"`
	Assets     []BackupAsset `json:"assets"`
}
type stagedImport struct {
	backup      Backup
	images      map[string]assets.Image
	sessionHash string
	expires     time.Time
	timer       *time.Timer
}

func configuration(ctx context.Context, tx *sql.Tx) (Backup, []storedAsset, error) {
	value := Backup{Format: "nexa-home-backup", Version: 1, ExportedAt: db.Timestamp(time.Now()), Assets: make([]BackupAsset, 0)}
	var err error
	value.Settings, err = readSettings(ctx, tx)
	if err != nil {
		return value, nil, err
	}
	value.Categories, err = readCategories(ctx, tx)
	if err != nil {
		return value, nil, err
	}
	value.Services, err = readServices(ctx, tx, "")
	if err != nil {
		return value, nil, err
	}
	value.Tags, err = readTags(ctx, tx)
	if err != nil {
		return value, nil, err
	}
	icons, err := readAssets(ctx, tx)
	if err != nil {
		return value, nil, err
	}
	for _, icon := range icons {
		value.Assets = append(value.Assets, BackupAsset{ID: icon.ID, MIME: icon.MIME})
	}
	return value, icons, nil
}

// portableSize accounts for the exact base64 expansion without reading icon files.
// Base64 strings must be empty in value; the newline matches jsonResponse's output.
func portableSize(value Backup, sizes map[string]int) (int, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return 0, err
	}
	size := len(encoded) + 1
	for _, icon := range value.Assets {
		size += base64.StdEncoding.EncodedLen(sizes[icon.ID])
	}
	return size, nil
}

func (s *Server) ensurePortable(ctx context.Context, tx *sql.Tx) error {
	// ponytail: measure the bounded snapshot on writes; cache size deltas only if
	// profiling shows a problem, rather than risking an unrestorable configuration.
	value, icons, err := configuration(ctx, tx)
	if err != nil {
		return err
	}
	if len(value.Services) > MaxServices || len(value.Categories) > MaxCatalogEntries || len(value.Tags) > MaxCatalogEntries || len(icons) > MaxAssets {
		return &problem{status: 409, code: "LIMIT_EXCEEDED", message: "Configuration exceeds a catalog or icon count limit"}
	}
	sizes := make(map[string]int, len(icons))
	for _, icon := range icons {
		sizes[icon.ID] = icon.ByteSize
	}
	size, err := portableSize(value, sizes)
	if err != nil {
		return err
	}
	if size > MaxBackupBytes {
		return &problem{status: 409, code: "LIMIT_EXCEEDED", message: "Full configuration exceeds the 16 MiB portable backup budget"}
	}
	return nil
}

func (s *Server) backupRoutes() {
	s.route("GET", "/api/v1/admin/backup/export", true, s.exportBackup)
	s.route("POST", "/api/v1/admin/backup/validate", true, s.validateBackup)
	s.route("POST", "/api/v1/admin/backup/commit", true, s.commitBackup)
}

func (s *Server) exportBackup(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
	query, err := queries(r, "includeAssets")
	if err != nil {
		return err
	}
	include := true
	if query.Has("includeAssets") {
		if query.Get("includeAssets") != "true" && query.Get("includeAssets") != "false" {
			return invalid("includeAssets", "Use true or false")
		}
		include = query.Get("includeAssets") == "true"
	}
	var value Backup
	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		var icons []storedAsset
		var err error
		value, icons, err = configuration(r.Context(), tx)
		if err != nil {
			return err
		}
		if !include {
			value.Assets = make([]BackupAsset, 0)
			return nil
		}
		for i, icon := range icons {
			data, err := s.assets.Read(icon.Path, icon.SHA256, icon.ByteSize)
			if err != nil {
				return err
			}
			value.Assets[i].Base64 = base64.StdEncoding.EncodeToString(data)
		}
		return nil
	})
	if err != nil {
		return err
	}
	body, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if len(body)+1 > MaxBackupBytes {
		return &problem{status: 409, code: "LIMIT_EXCEEDED", message: "Configuration exceeds the portable backup budget"}
	}
	w.Header().Set("Content-Disposition", `attachment; filename="nexa-home-`+time.Now().UTC().Format("20060102")+`.json"`)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	_, _ = w.Write(append(body, '\n'))
	return nil
}

func (s *Server) validateBackup(w http.ResponseWriter, r *http.Request, session auth.Session) error {
	var value Backup
	if err := s.decode(w, r, &value, MaxBackupBytes); err != nil {
		return err
	}
	images, err := validateImport(&value)
	if err != nil {
		return err
	}
	var current Settings
	if err := s.withTx(r.Context(), func(tx *sql.Tx) error { var err error; current, err = readSettings(r.Context(), tx); return err }); err != nil {
		return err
	}
	refreshImportTimes(&value, current.Revision+1, time.Now())
	sizes := make(map[string]int, len(images))
	for id, image := range images {
		sizes[id] = len(image.Data)
	}
	size, err := portableSize(value, sizes)
	if err != nil {
		return err
	}
	if size > MaxBackupBytes {
		return invalid("assets", "Canonical configuration exceeds the 16 MiB restore budget")
	}
	s.importMu.Lock()
	for key, previous := range s.imports {
		if previous.sessionHash == session.IDHash || !time.Now().Before(previous.expires) {
			previous.timer.Stop()
			delete(s.imports, key)
		}
	}
	if len(s.imports) >= MaxPendingImports {
		s.importMu.Unlock()
		w.Header().Set("Retry-After", strconv.Itoa(int(ImportLifetime.Seconds())))
		return &problem{status: 429, code: "RATE_LIMITED", message: "Too many pending imports; retry in five minutes"}
	}
	var random [32]byte
	_, _ = rand.Read(random[:])
	token := base64.RawURLEncoding.EncodeToString(random[:])
	key := sha256.Sum256([]byte(token))
	pending := &stagedImport{backup: value, images: images, sessionHash: session.IDHash, expires: time.Now().Add(ImportLifetime)}
	pending.timer = time.AfterFunc(ImportLifetime, func() { s.importMu.Lock(); delete(s.imports, key); s.importMu.Unlock() })
	s.imports[key] = pending
	s.importMu.Unlock()
	changed := 0
	if value.Settings.SettingsFields != current.SettingsFields {
		changed = 1
	}
	return jsonResponse(w, 200, struct {
		Valid       bool           `json:"valid"`
		Summary     map[string]int `json:"summary"`
		ImportToken string         `json:"importToken"`
	}{true, map[string]int{"categories": len(value.Categories), "services": len(value.Services), "tags": len(value.Tags), "assets": len(value.Assets), "settingsChanged": changed}, token})
}

func (s *Server) takeImport(token, sessionHash string) (*stagedImport, error) {
	key := sha256.Sum256([]byte(token))
	s.importMu.Lock()
	defer s.importMu.Unlock()
	pending := s.imports[key]
	if pending == nil || pending.sessionHash != sessionHash {
		return nil, &problem{status: 403, code: "FORBIDDEN", message: "Invalid or expired import token"}
	}
	delete(s.imports, key)
	pending.timer.Stop()
	if !time.Now().Before(pending.expires) {
		return nil, &problem{status: 403, code: "FORBIDDEN", message: "Invalid or expired import token"}
	}
	return pending, nil
}

func (s *Server) commitBackup(w http.ResponseWriter, r *http.Request, session auth.Session) error {
	var input struct {
		ImportToken string `json:"importToken"`
		Replace     bool   `json:"replace"`
	}
	if err := s.decode(w, r, &input, JSONLimit); err != nil {
		return err
	}
	pending, err := s.takeImport(input.ImportToken, session.IDHash)
	if err != nil {
		return err
	}
	s.assetMu.Lock()
	defer s.assetMu.Unlock()
	created := make([]string, 0, len(pending.images))
	cleanup := func(failure error) error {
		if cleanupError := s.discardStaged(r.Context(), created...); cleanupError != nil {
			return cleanupError
		}
		return failure
	}
	for _, icon := range pending.backup.Assets {
		image := pending.images[icon.ID]
		fresh, err := s.assets.Put(image)
		if err != nil {
			return cleanup(err)
		}
		if fresh {
			created = append(created, image.Path())
		}
	}
	var revision int64
	err = s.mutate(r, "backup.restore", "backup", "", func(tx *sql.Tx) error {
		current, err := readSettings(r.Context(), tx)
		if err != nil {
			return err
		}
		revision = current.Revision + 1
		refreshImportTimes(&pending.backup, revision, time.Now())
		return replaceConfiguration(r.Context(), tx, pending.backup, pending.images)
	})
	if err != nil {
		return cleanup(err)
	}
	if err := s.collectAssets(r.Context()); err != nil {
		s.logger.WarnContext(r.Context(), "deferred orphan icon cleanup after restore")
	}
	return jsonResponse(w, 200, map[string]int64{"revision": revision})
}

func refreshImportTimes(value *Backup, revision int64, now time.Time) {
	stamp := db.Timestamp(now)
	value.ExportedAt = stamp
	value.Settings.Revision = revision
	value.Settings.UpdatedAt = stamp
	for i := range value.Categories {
		value.Categories[i].CreatedAt = stamp
		value.Categories[i].UpdatedAt = stamp
	}
	for i := range value.Services {
		value.Services[i].CreatedAt = stamp
		value.Services[i].UpdatedAt = stamp
	}
	for i := range value.Tags {
		value.Tags[i].CreatedAt = stamp
	}
}

func replaceConfiguration(ctx context.Context, tx *sql.Tx, value Backup, images map[string]assets.Image) error {
	// The administrator, sessions, rate limits, and audit history are never replaced.
	for _, table := range []string{"service_tags", "service_links", "services", "categories", "tags", "icon_assets", "app_settings"} {
		if _, err := tx.ExecContext(ctx, "DELETE FROM "+table); err != nil {
			return err
		}
	}
	settings := value.Settings
	if _, err := tx.ExecContext(ctx, `INSERT INTO app_settings(id,site_title,site_subtitle,access_mode,theme,accent,card_density,glass_enabled,revision,updated_at) VALUES(1,?,?,?,?,?,?,?,?,?)`, settings.SiteTitle, settings.SiteSubtitle, settings.AccessMode, settings.Theme, settings.Accent, settings.CardDensity, settings.GlassEnabled, settings.Revision, settings.UpdatedAt); err != nil {
		return err
	}
	for _, category := range value.Categories {
		if _, err := tx.ExecContext(ctx, `INSERT INTO categories(id,name,description,icon,position,is_visible,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`, category.ID, category.Name, category.Description, category.Icon, category.Position, category.IsVisible, category.CreatedAt, category.UpdatedAt); err != nil {
			return err
		}
	}
	for _, tag := range value.Tags {
		if _, err := tx.ExecContext(ctx, "INSERT INTO tags(id,name,created_at) VALUES(?,?,?)", tag.ID, tag.Name, tag.CreatedAt); err != nil {
			return err
		}
	}
	for _, icon := range value.Assets {
		if err := insertAsset(ctx, tx, icon.ID, images[icon.ID], time.Now()); err != nil {
			return err
		}
	}
	for _, service := range value.Services {
		if _, err := tx.ExecContext(ctx, `INSERT INTO services(id,name,description,category_id,icon_kind,icon_value,icon_asset_id,color,open_mode,is_favorite,is_visible,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, service.ID, service.Name, service.Description, service.CategoryID, service.IconKind, service.IconValue, service.IconAssetID, service.Color, service.OpenMode, service.IsFavorite, service.IsVisible, service.Position, service.CreatedAt, service.UpdatedAt); err != nil {
			return err
		}
		for position, link := range service.Links {
			if _, err := tx.ExecContext(ctx, "INSERT INTO service_links(id,service_id,label,url,position) VALUES(?,?,?,?,?)", link.ID, service.ID, link.Label, link.URL, position); err != nil {
				return err
			}
		}
		for _, tagID := range service.TagIDs {
			if _, err := tx.ExecContext(ctx, "INSERT INTO service_tags(service_id,tag_id) VALUES(?,?)", service.ID, tagID); err != nil {
				return err
			}
		}
	}
	return nil
}
