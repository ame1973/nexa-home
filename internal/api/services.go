package api

import (
	"database/sql"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"nexa-home/internal/auth"
	"nexa-home/internal/db"

	"github.com/google/uuid"
)

func (s *Server) serviceRoutes() {
	s.route("GET", "/api/v1/admin/services", true, s.listServices)
	s.route("POST", "/api/v1/admin/services", true, s.saveService)
	s.route("PUT", "/api/v1/admin/services/{id}", true, s.saveService)
	s.route("GET", "/api/v1/admin/services/{id}", true, func(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
		var values []Service
		err := s.withTx(r.Context(), func(tx *sql.Tx) error {
			var err error
			values, err = readServices(r.Context(), tx, r.PathValue("id"))
			return err
		})
		if err != nil {
			return err
		}
		if len(values) == 0 {
			return missing()
		}
		return jsonResponse(w, 200, values[0])
	})
	s.route("DELETE", "/api/v1/admin/services/{id}", true, func(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
		err := s.mutate(r, "service.delete", "service", r.PathValue("id"), func(tx *sql.Tx) error {
			return changed(tx.ExecContext(r.Context(), "DELETE FROM services WHERE id=?", r.PathValue("id")))
		})
		if err != nil {
			return err
		}
		w.WriteHeader(204)
		return nil
	})
	s.route("PUT", "/api/v1/admin/services/reorder", true, s.reorderServices)
}

func queries(r *http.Request, allowed ...string) (url.Values, error) {
	values, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		return nil, invalid("query", "Malformed query parameters")
	}
	for key, items := range values {
		found := false
		for _, name := range allowed {
			if key == name {
				found = true
				break
			}
		}
		if !found || len(items) != 1 {
			return nil, invalid("query", "Unknown or duplicate query parameter")
		}
	}
	return values, nil
}

func (s *Server) listServices(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
	query, err := queries(r, "page", "pageSize", "q")
	if err != nil {
		return err
	}
	page, size := 1, 50
	if query.Has("page") {
		page, err = strconv.Atoi(query.Get("page"))
		if err != nil || page < 1 {
			return invalid("page", "Page must be a positive integer")
		}
	}
	if query.Has("pageSize") {
		size, err = strconv.Atoi(query.Get("pageSize"))
		if err != nil || size < 1 || size > 200 {
			return invalid("pageSize", "Use a page size from 1 to 200")
		}
	}
	if !utf8.ValidString(query.Get("q")) || utf8.RuneCountInString(query.Get("q")) > 100 {
		return invalid("q", "Use at most 100 characters")
	}
	term := strings.ToLower(strings.TrimSpace(query.Get("q")))
	var values []Service
	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		var err error
		values, err = readServices(r.Context(), tx, "")
		if err != nil || term == "" {
			return err
		}
		categories, err := readCategories(r.Context(), tx)
		if err != nil {
			return err
		}
		tags, err := readTags(r.Context(), tx)
		if err != nil {
			return err
		}
		categoryNames := make(map[string]string)
		tagNames := make(map[string]string)
		for _, category := range categories {
			categoryNames[category.ID] = category.Name
		}
		for _, tag := range tags {
			tagNames[tag.ID] = tag.Name
		}
		filtered := make([]Service, 0)
		for _, value := range values {
			parts := []string{value.Name, value.Description}
			if value.CategoryID != nil {
				parts = append(parts, categoryNames[*value.CategoryID])
			}
			for _, tagID := range value.TagIDs {
				parts = append(parts, tagNames[tagID])
			}
			for _, part := range parts {
				if strings.Contains(strings.ToLower(part), term) {
					filtered = append(filtered, value)
					break
				}
			}
		}
		values = filtered
		return nil
	})
	if err != nil {
		return err
	}
	result := ServicePage{Items: make([]Service, 0), Total: len(values), Page: page, PageSize: size}
	// Check the quotient before multiplying an attacker-controlled page number.
	if page-1 <= len(values)/size {
		start := (page - 1) * size
		end := min(start+size, len(values))
		result.Items = values[start:end]
	}
	return jsonResponse(w, 200, result)
}

func (s *Server) saveService(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
	var input ServiceInput
	if err := s.decode(w, r, &input, JSONLimit); err != nil {
		return err
	}
	if err := validateService(&input); err != nil {
		return err
	}
	id, action, status := r.PathValue("id"), "service.update", 200
	if r.Method == "POST" {
		id = uuid.NewString()
		action = "service.create"
		status = 201
	}
	var value Service
	err := s.mutate(r, action, "service", id, func(tx *sql.Tx) error {
		var position int
		var created string
		now := db.Timestamp(time.Now())
		if r.Method == "POST" {
			var count int
			if err := tx.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM services").Scan(&count); err != nil {
				return err
			}
			if count >= MaxServices {
				return &problem{status: 409, code: "LIMIT_EXCEEDED", message: "The 5000-service limit has been reached"}
			}
			if err := tx.QueryRowContext(r.Context(), "SELECT COALESCE(MAX(position),-1)+1 FROM services WHERE category_id IS ?", input.CategoryID).Scan(&position); err != nil {
				return err
			}
			created = now
		} else {
			if err := tx.QueryRowContext(r.Context(), "SELECT position,created_at FROM services WHERE id=?", id).Scan(&position, &created); err != nil {
				return err
			}
		}
		if err := serviceReferences(r, tx, input); err != nil {
			return err
		}
		if r.Method == "POST" {
			_, err := tx.ExecContext(r.Context(), `INSERT INTO services(id,name,description,category_id,icon_kind,icon_value,icon_asset_id,color,open_mode,is_favorite,is_visible,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, input.Name, input.Description, input.CategoryID, input.IconKind, input.IconValue, input.IconAssetID, input.Color, input.OpenMode, input.IsFavorite, input.IsVisible, position, created, now)
			if err != nil {
				return err
			}
		} else {
			if _, err := tx.ExecContext(r.Context(), `UPDATE services SET name=?,description=?,category_id=?,icon_kind=?,icon_value=?,icon_asset_id=?,color=?,open_mode=?,is_favorite=?,is_visible=?,updated_at=? WHERE id=?`, input.Name, input.Description, input.CategoryID, input.IconKind, input.IconValue, input.IconAssetID, input.Color, input.OpenMode, input.IsFavorite, input.IsVisible, now, id); err != nil {
				return err
			}
			if _, err := tx.ExecContext(r.Context(), "DELETE FROM service_links WHERE service_id=?", id); err != nil {
				return err
			}
			if _, err := tx.ExecContext(r.Context(), "DELETE FROM service_tags WHERE service_id=?", id); err != nil {
				return err
			}
		}
		for i, link := range input.Links {
			if _, err := tx.ExecContext(r.Context(), "INSERT INTO service_links(id,service_id,label,url,position) VALUES(?,?,?,?,?)", uuid.NewString(), id, link.Label, link.URL, i); err != nil {
				return err
			}
		}
		for _, tagID := range input.TagIDs {
			if _, err := tx.ExecContext(r.Context(), "INSERT INTO service_tags(service_id,tag_id) VALUES(?,?)", id, tagID); err != nil {
				return err
			}
		}
		values, err := readServices(r.Context(), tx, id)
		if err != nil {
			return err
		}
		value = values[0]
		return nil
	})
	if err != nil {
		return err
	}
	return jsonResponse(w, status, value)
}

func serviceReferences(r *http.Request, tx *sql.Tx, input ServiceInput) error {
	for _, reference := range []struct {
		table string
		id    *string
	}{{"categories", input.CategoryID}, {"icon_assets", input.IconAssetID}} {
		if reference.id == nil {
			continue
		}
		var found bool
		if err := tx.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM "+reference.table+" WHERE id=?)", *reference.id).Scan(&found); err != nil {
			return err
		}
		if !found {
			return conflict("Referenced category or icon does not exist")
		}
	}
	for _, id := range input.TagIDs {
		var found bool
		if err := tx.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM tags WHERE id=?)", id).Scan(&found); err != nil {
			return err
		}
		if !found {
			return conflict("Referenced tag does not exist")
		}
	}
	return nil
}

func (s *Server) reorderServices(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
	var input struct {
		CategoryID *string  `json:"categoryId"`
		IDs        []string `json:"ids"`
	}
	if err := s.decode(w, r, &input, JSONLimit); err != nil {
		return err
	}
	target := ""
	if input.CategoryID != nil {
		target = *input.CategoryID
	}
	err := s.mutate(r, "service.reorder", "category", target, func(tx *sql.Tx) error {
		if input.CategoryID != nil {
			var found bool
			if err := tx.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM categories WHERE id=?)", target).Scan(&found); err != nil {
				return err
			}
			if !found {
				return conflict("Reorder category does not exist")
			}
		}
		rows, err := tx.QueryContext(r.Context(), "SELECT id FROM services WHERE category_id IS ?", input.CategoryID)
		if err != nil {
			return err
		}
		current := make([]string, 0)
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			current = append(current, id)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		if !permutation(current, input.IDs) {
			return conflict("Reorder must contain every service in the category, including hidden services")
		}
		for position, id := range input.IDs {
			if _, err := tx.ExecContext(r.Context(), "UPDATE services SET position=?,updated_at=? WHERE id=?", position, db.Timestamp(time.Now()), id); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	w.WriteHeader(204)
	return nil
}
