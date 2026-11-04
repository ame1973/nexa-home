package api

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"nexa-home/internal/db"

	"github.com/google/uuid"
)

func TestPortableCatalogCountsRollback(t *testing.T) {
	for _, table := range []string{"categories", "tags"} {
		t.Run(table, func(t *testing.T) {
			h := adminHarness(t)
			before := h.export()
			r := httptest.NewRequest("POST", origin+"/api/v1/admin/"+table, nil)
			err := h.server.mutate(r, "test.capacity", table, "", func(tx *sql.Tx) error {
				query := "INSERT INTO tags(id,name,created_at) VALUES(?,?,?)"
				if table == "categories" {
					query = "INSERT INTO categories(id,name,created_at,updated_at) VALUES(?,?,?,?)"
				}
				statement, err := tx.PrepareContext(context.Background(), query)
				if err != nil {
					return err
				}
				defer statement.Close()
				stamp := db.Timestamp(time.Now())
				for i := 0; i <= MaxCatalogEntries; i++ {
					args := []any{uuid.NewString(), fmt.Sprintf("Fixture %d", i), stamp}
					if table == "categories" {
						args = append(args, stamp)
					}
					if _, err := statement.ExecContext(context.Background(), args...); err != nil {
						return err
					}
				}
				return nil
			})
			var limit *problem
			if !errors.As(err, &limit) || limit.code != "LIMIT_EXCEEDED" {
				t.Fatal("catalog capacity not enforced", err)
			}
			sameConfiguration(t, before, h.export())
		})
	}
}

func TestBackupArraySchemaCaps(t *testing.T) {
	h, baseline := backupFixture(t)
	for _, field := range []string{"categories", "tags", "services", "assets"} {
		t.Run(field, func(t *testing.T) {
			value := cloneBackup(t, baseline)
			switch field {
			case "categories":
				value.Categories = make([]Category, MaxCatalogEntries+1)
				for i := range value.Categories {
					value.Categories[i] = baseline.Categories[0]
				}
			case "tags":
				value.Tags = make([]Tag, MaxCatalogEntries+1)
				for i := range value.Tags {
					value.Tags[i] = baseline.Tags[0]
				}
			case "services":
				value.Services = make([]Service, MaxServices+1)
				for i := range value.Services {
					value.Services[i] = baseline.Services[0]
				}
			case "assets":
				value.Assets = make([]BackupAsset, MaxAssets+1)
				for i := range value.Assets {
					value.Assets[i] = baseline.Assets[0]
				}
			}
			w := h.request("POST", "/api/v1/admin/backup/validate", value, 400)
			result := readResponse[struct {
				Error struct {
					Details map[string]string `json:"details"`
				} `json:"error"`
			}](t, w)
			if result.Error.Details[field] == "" {
				t.Fatalf("schema did not reject %s count: %s", field, w.Body.String())
			}
			sameConfiguration(t, baseline, h.export())
		})
	}
}

func TestEmptyRestoreAndCorruptExport(t *testing.T) {
	t.Run("empty replacement", func(t *testing.T) {
		h, value := backupFixture(t)
		value.Services = []Service{}
		value.Categories = []Category{}
		value.Tags = []Tag{}
		value.Assets = []BackupAsset{}
		value.Settings.SiteTitle = "Clean home"
		h.restore(h.stage(value), 200)
		result := h.export()
		if result.Services == nil || result.Categories == nil || result.Tags == nil || result.Assets == nil || len(result.Services) != 0 || len(result.Categories) != 0 || len(result.Tags) != 0 || len(result.Assets) != 0 {
			t.Fatal("empty restore did not clear configuration")
		}
		if len(assetFiles(t, h)) != 0 {
			t.Fatal("empty restore did not collect old icons")
		}
		h.request("GET", "/api/v1/auth/me", nil, 200)
	})
	t.Run("corrupt stored hash", func(t *testing.T) {
		h, _ := backupFixture(t)
		if _, err := h.database.Exec("UPDATE icon_assets SET sha256=?", strings.Repeat("f", 64)); err != nil {
			t.Fatal(err)
		}
		w := h.request("GET", "/api/v1/admin/backup/export", nil, 500)
		if strings.Contains(w.Body.String(), h.server.config.DataDir) || strings.Contains(w.Body.String(), strings.Repeat("f", 64)) {
			t.Fatal("corrupt export leaked storage metadata")
		}
	})
}
