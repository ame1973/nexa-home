package api

import (
	"database/sql"
	"net/http"
	"strings"
	"time"

	"nexa-home/internal/auth"
	"nexa-home/internal/db"
	"nexa-home/internal/security"

	"github.com/google/uuid"
)

func (s *Server) catalogRoutes() {
	s.route("GET", "/api/v1/admin/categories", true, func(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
		var values []Category
		err := s.withTx(r.Context(), func(tx *sql.Tx) error { var err error; values, err = readCategories(r.Context(), tx); return err })
		if err != nil {
			return err
		}
		return jsonResponse(w, 200, values)
	})
	s.route("POST", "/api/v1/admin/categories", true, s.saveCategory)
	s.route("PUT", "/api/v1/admin/categories/{id}", true, s.saveCategory)
	s.route("DELETE", "/api/v1/admin/categories/{id}", true, func(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
		err := s.mutate(r, "category.delete", "category", r.PathValue("id"), func(tx *sql.Tx) error {
			return changed(tx.ExecContext(r.Context(), "DELETE FROM categories WHERE id=?", r.PathValue("id")))
		})
		if err != nil {
			return err
		}
		w.WriteHeader(204)
		return nil
	})
	s.route("PUT", "/api/v1/admin/categories/reorder", true, func(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
		var input struct {
			IDs []string `json:"ids"`
		}
		if err := s.decode(w, r, &input, JSONLimit); err != nil {
			return err
		}
		err := s.mutate(r, "category.reorder", "category", "", func(tx *sql.Tx) error {
			categories, err := readCategories(r.Context(), tx)
			if err != nil {
				return err
			}
			current := make([]string, len(categories))
			for i, value := range categories {
				current[i] = value.ID
			}
			if !permutation(current, input.IDs) {
				return conflict("Reorder must contain every category exactly once")
			}
			for position, id := range input.IDs {
				if _, err := tx.ExecContext(r.Context(), "UPDATE categories SET position=?,updated_at=? WHERE id=?", position, db.Timestamp(time.Now()), id); err != nil {
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
	})
	s.route("GET", "/api/v1/admin/tags", true, func(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
		var values []Tag
		err := s.withTx(r.Context(), func(tx *sql.Tx) error { var err error; values, err = readTags(r.Context(), tx); return err })
		if err != nil {
			return err
		}
		return jsonResponse(w, 200, values)
	})
	s.route("POST", "/api/v1/admin/tags", true, s.saveTag)
	s.route("PUT", "/api/v1/admin/tags/{id}", true, s.saveTag)
	s.route("DELETE", "/api/v1/admin/tags/{id}", true, func(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
		err := s.mutate(r, "tag.delete", "tag", r.PathValue("id"), func(tx *sql.Tx) error {
			return changed(tx.ExecContext(r.Context(), "DELETE FROM tags WHERE id=?", r.PathValue("id")))
		})
		if err != nil {
			return err
		}
		w.WriteHeader(204)
		return nil
	})
}

func (s *Server) saveCategory(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
	var input CategoryInput
	if err := s.decode(w, r, &input, JSONLimit); err != nil {
		return err
	}
	if err := validateCategory(&input); err != nil {
		return err
	}
	id, action, status := r.PathValue("id"), "category.update", 200
	if r.Method == "POST" {
		id = uuid.NewString()
		action = "category.create"
		status = 201
	}
	var value Category
	err := s.mutate(r, action, "category", id, func(tx *sql.Tx) error {
		categories, err := readCategories(r.Context(), tx)
		if err != nil {
			return err
		}
		found, duplicate := false, false
		for _, category := range categories {
			if category.ID == id {
				value = category
				found = true
			} else if nameKey(category.Name) == nameKey(input.Name) {
				duplicate = true
			}
		}
		if r.Method == "PUT" && !found {
			return missing()
		}
		if duplicate {
			return conflict("A category with this name already exists")
		}
		now := db.Timestamp(time.Now())
		if r.Method == "POST" {
			position := 0
			for _, category := range categories {
				if category.Position >= position {
					if category.Position >= MaxPosition {
						return conflict("Reorder categories before appending another entry")
					}
					position = category.Position + 1
				}
			}
			value = Category{CategoryInput: input, ID: id, Position: position, CreatedAt: now, UpdatedAt: now}
			_, err = tx.ExecContext(r.Context(), `INSERT INTO categories(id,name,description,icon,position,is_visible,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`, id, input.Name, input.Description, input.Icon, position, input.IsVisible, now, now)
		} else {
			value.CategoryInput = input
			value.UpdatedAt = now
			_, err = tx.ExecContext(r.Context(), "UPDATE categories SET name=?,description=?,icon=?,is_visible=?,updated_at=? WHERE id=?", input.Name, input.Description, input.Icon, input.IsVisible, now, id)
		}
		return err
	})
	if err != nil {
		return err
	}
	return jsonResponse(w, status, value)
}

func (s *Server) saveTag(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
	var input struct {
		Name string `json:"name"`
	}
	if err := s.decode(w, r, &input, JSONLimit); err != nil {
		return err
	}
	input.Name = strings.TrimSpace(input.Name)
	if !security.Text(input.Name, 1, 32) {
		return invalid("name", "Use 1 to 32 characters")
	}
	id, action, status := r.PathValue("id"), "tag.update", 200
	if r.Method == "POST" {
		id = uuid.NewString()
		action = "tag.create"
		status = 201
	}
	var value Tag
	err := s.mutate(r, action, "tag", id, func(tx *sql.Tx) error {
		tags, err := readTags(r.Context(), tx)
		if err != nil {
			return err
		}
		found, duplicate := false, false
		for _, tag := range tags {
			if tag.ID == id {
				value = tag
				found = true
			} else if nameKey(tag.Name) == nameKey(input.Name) {
				duplicate = true
			}
		}
		if r.Method == "PUT" && !found {
			return missing()
		}
		if duplicate {
			return conflict("A tag with this name already exists")
		}
		value.Name = input.Name
		if r.Method == "POST" {
			value.ID = id
			value.CreatedAt = db.Timestamp(time.Now())
			_, err = tx.ExecContext(r.Context(), "INSERT INTO tags(id,name,created_at) VALUES(?,?,?)", id, value.Name, value.CreatedAt)
		} else {
			_, err = tx.ExecContext(r.Context(), "UPDATE tags SET name=? WHERE id=?", value.Name, id)
		}
		return err
	})
	if err != nil {
		return err
	}
	return jsonResponse(w, status, value)
}

func permutation(current, proposed []string) bool {
	if len(current) != len(proposed) {
		return false
	}
	remaining := make(map[string]bool, len(current))
	for _, id := range current {
		remaining[id] = true
	}
	for _, id := range proposed {
		if !remaining[id] {
			return false
		}
		delete(remaining, id)
	}
	return len(remaining) == 0
}
