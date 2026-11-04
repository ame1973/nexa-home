package api

import (
	"database/sql"
	"errors"
	"net/http"
	"time"

	"nexa-home/internal/auth"
	"nexa-home/internal/db"
)

func (s *Server) settingsRoutes() {
	s.route("GET", "/api/v1/admin/settings", true, func(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
		var value Settings
		err := s.withTx(r.Context(), func(tx *sql.Tx) error { var err error; value, err = readSettings(r.Context(), tx); return err })
		if err != nil {
			return err
		}
		return jsonResponse(w, 200, value)
	})
	s.route("PUT", "/api/v1/admin/settings", true, func(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
		var input SettingsInput
		if err := s.decode(w, r, &input, JSONLimit); err != nil {
			return err
		}
		if err := validateSettings(&input.SettingsFields); err != nil {
			return err
		}
		var value Settings
		err := s.mutate(r, "settings.update", "settings", "1", func(tx *sql.Tx) error {
			result, err := tx.ExecContext(r.Context(), `UPDATE app_settings SET site_title=?,site_subtitle=?,access_mode=?,theme=?,accent=?,card_density=?,glass_enabled=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?`,
				input.SiteTitle, input.SiteSubtitle, input.AccessMode, input.Theme, input.Accent, input.CardDensity, input.GlassEnabled, db.Timestamp(time.Now()), input.ExpectedRevision)
			if err != nil {
				return err
			}
			count, err := result.RowsAffected()
			if err != nil {
				return err
			}
			if count != 1 {
				return &problem{status: 409, code: "REVISION_CONFLICT", message: "Settings changed; reload before saving"}
			}
			value, err = readSettings(r.Context(), tx)
			return err
		})
		if err != nil {
			return err
		}
		return jsonResponse(w, 200, value)
	})
	s.route("GET", "/api/v1/public/bootstrap", false, s.bootstrap)
}

func (s *Server) bootstrap(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
	initialized, err := s.auth.Initialized(r.Context())
	if err != nil {
		return err
	}
	if !initialized {
		return &problem{status: 403, code: "FORBIDDEN", message: "Complete protected setup before accessing the homepage"}
	}
	_, sessionError := s.session(r)
	if sessionError != nil && !errors.Is(sessionError, auth.ErrUnauthenticated) {
		return sessionError
	}
	var result Bootstrap
	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		var err error
		result.Settings, err = readSettings(r.Context(), tx)
		if err != nil {
			return err
		}
		if result.Settings.AccessMode == "private" && sessionError != nil {
			return auth.ErrUnauthenticated
		}
		result.Categories, err = readCategories(r.Context(), tx)
		if err != nil {
			return err
		}
		result.Services, err = readServices(r.Context(), tx, "")
		if err != nil {
			return err
		}
		result.Tags, err = readTags(r.Context(), tx)
		return err
	})
	if err != nil {
		return err
	}
	visible := make(map[string]bool, len(result.Categories))
	for _, category := range result.Categories {
		visible[category.ID] = category.IsVisible
	}
	usedCategories := make(map[string]bool)
	usedTags := make(map[string]bool)
	services := make([]Service, 0, len(result.Services))
	for _, service := range result.Services {
		if !service.IsVisible || (service.CategoryID != nil && !visible[*service.CategoryID]) {
			continue
		}
		services = append(services, service)
		if service.CategoryID != nil {
			usedCategories[*service.CategoryID] = true
		}
		for _, id := range service.TagIDs {
			usedTags[id] = true
		}
	}
	categories := make([]Category, 0, len(result.Categories))
	for _, category := range result.Categories {
		if usedCategories[category.ID] {
			categories = append(categories, category)
		}
	}
	tags := make([]Tag, 0, len(result.Tags))
	for _, tag := range result.Tags {
		if usedTags[tag.ID] {
			tags = append(tags, tag)
		}
	}
	result.Services = services
	result.Categories = categories
	result.Tags = tags
	return jsonResponse(w, 200, result)
}
