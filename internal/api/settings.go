package api

import (
	"bytes"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"nexa-home/internal/assets"
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
		// Base64 wallpaper and JSON-escaped CSS have independent bounded budgets.
		limit := int64(base64.StdEncoding.EncodedLen(assets.MaxBackgroundBytes) + (512 << 10))
		if err := s.decode(w, r, &input, limit); err != nil {
			return err
		}
		var background *assets.Background
		if input.BackgroundUpload != nil {
			// Serialize raster decoding and background replacement with asset restores.
			s.assetMu.Lock()
			defer s.assetMu.Unlock()
			if !bytes.Equal(input.BackgroundUpload, []byte("null")) {
				var encoded string
				if err := json.Unmarshal(input.BackgroundUpload, &encoded); err != nil {
					return invalid("backgroundUpload", "Use canonical base64 image content")
				}
				data, err := base64.StdEncoding.Strict().DecodeString(encoded)
				if err != nil || base64.StdEncoding.EncodeToString(data) != encoded {
					return invalid("backgroundUpload", "Use canonical base64 image content")
				}
				image, err := assets.ValidateBackgroundUpload(data)
				if errors.Is(err, assets.ErrBackgroundTooLarge) {
					return &problem{status: 413, code: "LIMIT_EXCEEDED", message: "Background image exceeds the 4 MiB limit"}
				}
				if err != nil {
					return invalid("backgroundUpload", "Use a valid PNG, JPEG or WebP image within the dimension limits")
				}
				background = &image
			}
		}
		var value Settings
		err := s.mutate(r, "settings.update", "settings", "1", func(tx *sql.Tx) error {
			if input.ThemePreset == "" || input.LayoutPreset == "" {
				// Older clients preserve appearance fields they do not know about.
				current, err := readSettings(r.Context(), tx)
				if err != nil {
					return err
				}
				if input.ThemePreset == "" {
					input.ThemePreset, input.CustomTheme, input.CustomCSS = current.ThemePreset, current.CustomTheme, current.CustomCSS
				}
				if input.LayoutPreset == "" {
					input.LayoutPreset = current.LayoutPreset
				}
			}
			if err := validateSettings(&input.SettingsFields); err != nil {
				return err
			}
			theme, err := json.Marshal(input.CustomTheme)
			if err != nil {
				return err
			}
			result, err := tx.ExecContext(r.Context(), `UPDATE app_settings SET site_title=?,site_subtitle=?,access_mode=?,theme=?,accent=?,card_density=?,glass_enabled=?,theme_preset=?,layout_preset=?,custom_theme=?,custom_css=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?`,
				input.SiteTitle, input.SiteSubtitle, input.AccessMode, input.Theme, input.Accent, input.CardDensity, input.GlassEnabled, input.ThemePreset, input.LayoutPreset, string(theme), input.CustomCSS, db.Timestamp(time.Now()), input.ExpectedRevision)
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
			if input.BackgroundUpload != nil {
				if err := writeBackground(r.Context(), tx, background); err != nil {
					return err
				}
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
	s.route("GET", "/api/v1/public/health", false, s.publicHealth)
	s.route("GET", "/api/v1/public/background/{hash}", false, s.publicBackground)
}

func (s *Server) publicSession(r *http.Request) (bool, error) {
	initialized, err := s.auth.Initialized(r.Context())
	if err != nil {
		return false, err
	}
	if !initialized {
		return false, &problem{status: 403, code: "FORBIDDEN", message: "Complete protected setup before accessing the homepage"}
	}
	_, sessionError := s.session(r)
	if sessionError != nil && !errors.Is(sessionError, auth.ErrUnauthenticated) {
		return false, sessionError
	}
	return sessionError == nil, nil
}

func (s *Server) bootstrap(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
	authenticated, err := s.publicSession(r)
	if err != nil {
		return err
	}
	var result Bootstrap
	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		var err error
		result.Settings, err = readSettings(r.Context(), tx)
		if err != nil {
			return err
		}
		if result.Settings.AccessMode == "private" && !authenticated {
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
	result.Health = make([]HealthStatus, 0)
	for _, service := range result.Services {
		if !service.IsVisible || (service.CategoryID != nil && !visible[*service.CategoryID]) {
			continue
		}
		// Health endpoints are administrator-only configuration, even on public sites.
		if service.HealthCheck != nil {
			result.Health = append(result.Health, s.health.status(service.ID, *service.HealthCheck))
		}
		service.HealthCheck = nil
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
