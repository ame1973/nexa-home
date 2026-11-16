package api

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"nexa-home/internal/assets"
	"nexa-home/internal/db"
)

// CheckData verifies the database and every referenced asset without garbage
// collection or authentication initialization. The caller holds the data lock.
func CheckData(ctx context.Context, database *sql.DB, directory string) (err error) {
	if err := db.Check(ctx, database); err != nil {
		return err
	}
	store, err := assets.Open(directory)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, store.Close()) }()
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	icons, err := readAssets(ctx, tx)
	if err != nil {
		return err
	}
	for _, icon := range icons {
		data, err := store.Read(icon.Path, icon.SHA256, icon.ByteSize)
		if err != nil {
			return fmt.Errorf("asset %s: %w", icon.ID, err)
		}
		image, err := assets.Validate(data)
		if err != nil {
			return fmt.Errorf("asset %s: %w", icon.ID, err)
		}
		if image.Kind != icon.Kind || image.MIME != icon.MIME {
			return fmt.Errorf("asset %s: %w", icon.ID, assets.ErrCorrupt)
		}
	}
	var version int
	if err := tx.QueryRowContext(ctx, "SELECT MAX(version) FROM schema_migrations").Scan(&version); err != nil {
		return err
	}
	if version >= 4 {
		info, err := readBackgroundInfo(ctx, tx)
		if err != nil {
			return err
		}
		if info != nil {
			data, err := readBackgroundBytes(ctx, tx, info)
			if err != nil {
				return fmt.Errorf("background: %w", err)
			}
			image, err := assets.ValidateBackground(data)
			if err != nil || image.MIME != info.MIME || image.Width != info.Width || image.Height != info.Height {
				return fmt.Errorf("background: %w", assets.ErrCorrupt)
			}
		}
	}
	return tx.Commit()
}
