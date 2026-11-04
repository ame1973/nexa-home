package db

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// Audit runs in the caller's mutation transaction and never records request bodies.
func Audit(ctx context.Context, tx *sql.Tx, now time.Time, action, targetType, targetID string) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO audit_log(id,occurred_at,action,target_type,target_id) VALUES(?,?,?,?,?)`,
		uuid.NewString(), Timestamp(now), action, targetType, targetID)
	return err
}
