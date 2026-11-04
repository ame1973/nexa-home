package api

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"nexa-home/internal/db"
)

func (s *Server) withTx(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := s.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Server) mutate(r *http.Request, action, targetType, targetID string, fn func(*sql.Tx) error) error {
	return s.withTx(r.Context(), func(tx *sql.Tx) error {
		if err := fn(tx); err != nil {
			return err
		}
		if err := s.ensurePortable(r.Context(), tx); err != nil {
			return err
		}
		return db.Audit(r.Context(), tx, time.Now(), action, targetType, targetID)
	})
}

func readSettings(ctx context.Context, tx *sql.Tx) (Settings, error) {
	var value Settings
	err := tx.QueryRowContext(ctx, `SELECT site_title,site_subtitle,access_mode,theme,accent,card_density,glass_enabled,revision,updated_at FROM app_settings WHERE id=1`).Scan(
		&value.SiteTitle, &value.SiteSubtitle, &value.AccessMode, &value.Theme, &value.Accent, &value.CardDensity, &value.GlassEnabled, &value.Revision, &value.UpdatedAt)
	return value, err
}

func readCategories(ctx context.Context, tx *sql.Tx) ([]Category, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id,name,description,icon,position,is_visible,created_at,updated_at FROM categories ORDER BY position,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := make([]Category, 0)
	for rows.Next() {
		var value Category
		if err := rows.Scan(&value.ID, &value.Name, &value.Description, &value.Icon, &value.Position, &value.IsVisible, &value.CreatedAt, &value.UpdatedAt); err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, rows.Err()
}

func readTags(ctx context.Context, tx *sql.Tx) ([]Tag, error) {
	rows, err := tx.QueryContext(ctx, "SELECT id,name,created_at FROM tags ORDER BY name COLLATE NOCASE,id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := make([]Tag, 0)
	for rows.Next() {
		var value Tag
		if err := rows.Scan(&value.ID, &value.Name, &value.CreatedAt); err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, rows.Err()
}

// readServices uses three bounded queries, not one query per link or tag.
func readServices(ctx context.Context, tx *sql.Tx, id string) ([]Service, error) {
	where, childrenWhere := "", ""
	var args []any
	if id != "" {
		where = " WHERE id=?"
		childrenWhere = " WHERE service_id=?"
		args = []any{id}
	}
	rows, err := tx.QueryContext(ctx, `SELECT id,name,description,category_id,icon_kind,icon_value,icon_asset_id,color,open_mode,is_favorite,is_visible,position,created_at,updated_at FROM services`+where+" ORDER BY position,id", args...)
	if err != nil {
		return nil, err
	}
	values := make([]Service, 0)
	index := make(map[string]int)
	for rows.Next() {
		var value Service
		if err := rows.Scan(&value.ID, &value.Name, &value.Description, &value.CategoryID, &value.IconKind, &value.IconValue, &value.IconAssetID, &value.Color, &value.OpenMode, &value.IsFavorite, &value.IsVisible, &value.Position, &value.CreatedAt, &value.UpdatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		value.Links = make([]Link, 0)
		value.TagIDs = make([]string, 0)
		index[value.ID] = len(values)
		values = append(values, value)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	rows, err = tx.QueryContext(ctx, "SELECT id,service_id,label,url FROM service_links"+childrenWhere+" ORDER BY position,id", args...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var link Link
		var serviceID string
		if err := rows.Scan(&link.ID, &serviceID, &link.Label, &link.URL); err != nil {
			rows.Close()
			return nil, err
		}
		if i, ok := index[serviceID]; ok {
			values[i].Links = append(values[i].Links, link)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	rows, err = tx.QueryContext(ctx, "SELECT service_id,tag_id FROM service_tags"+childrenWhere+" ORDER BY tag_id", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var serviceID, tagID string
		if err := rows.Scan(&serviceID, &tagID); err != nil {
			return nil, err
		}
		if i, ok := index[serviceID]; ok {
			values[i].TagIDs = append(values[i].TagIDs, tagID)
		}
	}
	return values, rows.Err()
}

func changed(result sql.Result, err error) error {
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return missing()
	}
	return nil
}
