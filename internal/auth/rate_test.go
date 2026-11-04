package auth

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"nexa-home/internal/db"
)

func TestRateBucketCapacityRecoversAfterExpiry(t *testing.T) {
	s, token, now := fixture(t)
	ctx := context.Background()
	tx, err := s.database.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	statement, err := tx.PrepareContext(ctx, "INSERT INTO auth_rate_limits(key_hash,failure_count,window_started_at,locked_until) VALUES(?,5,?,?)")
	if err != nil {
		tx.Rollback()
		t.Fatal(err)
	}
	for i := 0; i < MaxRateBuckets; i++ {
		if _, err := statement.ExecContext(ctx, digest(fmt.Sprintf("setup:ip:fixture-%d", i)), db.Timestamp(*now), db.Timestamp(now.Add(Lockout))); err != nil {
			statement.Close()
			tx.Rollback()
			t.Fatal(err)
		}
	}
	statement.Close()
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := s.Setup(ctx, token, "admin", testPassword, "192.0.2.1"); !errors.Is(err, ErrRateLimited) {
		t.Fatal("saturated limiter did not fail closed", err)
	}
	var count int
	if err := s.database.QueryRow("SELECT COUNT(*) FROM auth_rate_limits").Scan(&count); err != nil || count != MaxRateBuckets {
		t.Fatalf("rate state grew: %d %v", count, err)
	}
	*now = now.Add(Lockout)
	if err := s.Setup(ctx, token, "admin", testPassword, "192.0.2.1"); err != nil {
		t.Fatal("limiter did not recover after expiry", err)
	}
}
