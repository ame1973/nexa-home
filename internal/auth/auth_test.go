package auth

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"nexa-home/internal/db"
)

const testPassword = "correct horse battery staple"

func fixture(t *testing.T) (*Service, string, *time.Time) {
	t.Helper()
	database, err := db.Open(context.Background(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	s, token, err := New(context.Background(), database)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	s.now = func() time.Time { return now }
	return s, token, &now
}

func initialized(t *testing.T) (*Service, *time.Time) {
	t.Helper()
	s, token, now := fixture(t)
	if err := s.Setup(context.Background(), token, "admin", testPassword, "192.0.2.1"); err != nil {
		t.Fatal(err)
	}
	return s, now
}

func login(t *testing.T, s *Service) (string, Session) {
	t.Helper()
	token, session, err := s.Login(context.Background(), "ADMIN", testPassword, "192.0.2.1", "test-browser")
	if err != nil {
		t.Fatal(err)
	}
	return token, session
}

func TestSetupAtomicAndSecretStorage(t *testing.T) {
	s, token, _ := fixture(t)
	ctx := context.Background()
	if initialized, err := s.Initialized(ctx); err != nil || initialized {
		t.Fatalf("initialized=%v err=%v", initialized, err)
	}
	if err := s.Setup(ctx, randomToken(), "admin", testPassword, "192.0.2.1"); !errors.Is(err, ErrForbidden) {
		t.Fatal(err)
	}
	var workers sync.WaitGroup
	results := make(chan error, 8)
	for range 8 {
		workers.Add(1)
		go func() { defer workers.Done(); results <- s.Setup(ctx, token, "admin", testPassword, "192.0.2.1") }()
	}
	workers.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		} else if !errors.Is(err, ErrConflict) {
			t.Fatal(err)
		}
	}
	if successes != 1 {
		t.Fatalf("created %d administrators", successes)
	}
	if s.setupHash != "" {
		t.Fatal("setup token not consumed")
	}
	var hash string
	if err := s.database.QueryRow("SELECT password_hash FROM admin_account").Scan(&hash); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(hash, testPassword) || !strings.HasPrefix(hash, "$argon2id$v=19$"+passwordParameters) || !verifyPassword(hash, testPassword) {
		t.Fatal("password not securely hashed")
	}
	_, secondToken, err := New(ctx, s.database)
	if err != nil || secondToken != "" {
		t.Fatal("restart reopened initialization")
	}
}

func TestSetupExpiryRateLimitAndValidation(t *testing.T) {
	t.Run("expiry", func(t *testing.T) {
		s, token, now := fixture(t)
		*now = s.setupExpires
		if err := s.Setup(context.Background(), token, "admin", testPassword, "192.0.2.1"); !errors.Is(err, ErrForbidden) {
			t.Fatal(err)
		}
	})
	t.Run("rate limit", func(t *testing.T) {
		s, token, now := fixture(t)
		ctx := context.Background()
		for range 5 {
			if err := s.Setup(ctx, randomToken(), "admin", testPassword, "192.0.2.1"); !errors.Is(err, ErrForbidden) {
				t.Fatal(err)
			}
		}
		if err := s.Setup(ctx, token, "admin", testPassword, "192.0.2.1"); !errors.Is(err, ErrRateLimited) {
			t.Fatal(err)
		}
		*now = now.Add(Lockout)
		if err := s.Setup(ctx, token, "admin", testPassword, "192.0.2.1"); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("validation", func(t *testing.T) {
		s, token, _ := fixture(t)
		for _, test := range []struct{ name, password string }{{"ab", testPassword}, {" admin", testPassword}, {"admin", "short"}, {"admin", strings.Repeat("x", 129)}} {
			if err := s.Setup(context.Background(), token, test.name, test.password, "192.0.2.1"); !errors.Is(err, ErrValidation) {
				t.Fatal(err)
			}
		}
	})
}

func TestLoginRateLimitAndRestart(t *testing.T) {
	s, now := initialized(t)
	ctx := context.Background()
	for i := 0; i < 5; i++ {
		name := "admin"
		if i%2 == 0 {
			name = "nonexistent"
		}
		if _, _, err := s.Login(ctx, name, "wrong password", "192.0.2.1", "agent"); !errors.Is(err, ErrUnauthenticated) {
			t.Fatal(err)
		}
	}
	if _, _, err := s.Login(ctx, "admin", testPassword, "192.0.2.2", "agent"); !errors.Is(err, ErrRateLimited) {
		t.Fatal("account limit bypassed using another IP", err)
	}
	restarted, _, err := New(ctx, s.database)
	if err != nil {
		t.Fatal(err)
	}
	restarted.now = s.now
	if _, _, err := restarted.Login(ctx, "admin", testPassword, "192.0.2.1", "agent"); !errors.Is(err, ErrRateLimited) {
		t.Fatal("restart bypassed lockout", err)
	}
	*now = now.Add(Lockout)
	_, _ = login(t, restarted)
	var count int
	if err := s.database.QueryRow("SELECT COUNT(*) FROM auth_rate_limits").Scan(&count); err != nil || count != 0 {
		t.Fatalf("successful login did not reset buckets: %d, %v", count, err)
	}
}

func TestSessionsCSRFLogoutAndRotation(t *testing.T) {
	s, _ := initialized(t)
	ctx := context.Background()
	token, session := login(t, s)
	secondToken, _ := login(t, s)
	if token == secondToken || token == session.CSRFToken {
		t.Fatal("session tokens not independently random")
	}
	current, err := s.Authenticate(ctx, token)
	if err != nil || current != session {
		t.Fatalf("session changed: %+v, %v", current, err)
	}
	if !CheckCSRF(session, session.CSRFToken) || CheckCSRF(session, randomToken()) || CheckCSRF(session, "") {
		t.Fatal("CSRF validation broken")
	}
	var storedToken, storedCSRF string
	if err := s.database.QueryRow("SELECT id_hash,csrf_secret_hash FROM admin_sessions WHERE id_hash=?", session.IDHash).Scan(&storedToken, &storedCSRF); err != nil {
		t.Fatal(err)
	}
	if storedToken == token || storedCSRF == session.CSRFToken || storedCSRF != digest(session.CSRFToken) {
		t.Fatal("plaintext session secret stored")
	}
	if err := s.Logout(ctx, session); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Authenticate(ctx, token); !errors.Is(err, ErrUnauthenticated) {
		t.Fatal(err)
	}
	if _, err := s.Authenticate(ctx, randomToken()); !errors.Is(err, ErrUnauthenticated) {
		t.Fatal(err)
	}
	if _, err := s.Authenticate(ctx, "fixed-session-id"); !errors.Is(err, ErrUnauthenticated) {
		t.Fatal(err)
	}
	second, err := s.Authenticate(ctx, secondToken)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.ChangePassword(ctx, second, "wrong password", "replacement password", "192.0.2.1"); !errors.Is(err, ErrUnauthenticated) {
		t.Fatal(err)
	}
	if err := s.ChangePassword(ctx, second, testPassword, "short", "192.0.2.1"); !errors.Is(err, ErrValidation) {
		t.Fatal(err)
	}
	if err := s.ChangePassword(ctx, second, testPassword, "replacement password", "192.0.2.1"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Authenticate(ctx, secondToken); !errors.Is(err, ErrUnauthenticated) {
		t.Fatal("password rotation retained session", err)
	}
	if _, _, err := s.Login(ctx, "admin", testPassword, "192.0.2.1", "agent"); !errors.Is(err, ErrUnauthenticated) {
		t.Fatal(err)
	}
	if _, _, err := s.Login(ctx, "admin", "replacement password", "192.0.2.1", "agent"); err != nil {
		t.Fatal(err)
	}
	var audits int
	if err := s.database.QueryRow("SELECT COUNT(*) FROM audit_log WHERE action='auth.password.change'").Scan(&audits); err != nil || audits != 1 {
		t.Fatalf("missing password audit: %d %v", audits, err)
	}
}

func TestSessionExpirations(t *testing.T) {
	t.Run("idle", func(t *testing.T) {
		s, now := initialized(t)
		token, _ := login(t, s)
		*now = now.Add(IdleLifetime)
		if _, err := s.Authenticate(context.Background(), token); !errors.Is(err, ErrUnauthenticated) {
			t.Fatal(err)
		}
	})
	t.Run("absolute despite activity", func(t *testing.T) {
		s, now := initialized(t)
		token, _ := login(t, s)
		deadline := now.Add(AbsoluteLifetime)
		for now.Add(11 * time.Hour).Before(deadline) {
			*now = now.Add(11 * time.Hour)
			if _, err := s.Authenticate(context.Background(), token); err != nil {
				t.Fatal(err)
			}
		}
		*now = deadline
		if _, err := s.Authenticate(context.Background(), token); !errors.Is(err, ErrUnauthenticated) {
			t.Fatal(err)
		}
	})
}

func TestPasswords(t *testing.T) {
	password := strings.Repeat("密碼", 6)
	if !validPassword(password) || validPassword("short") || validPassword(strings.Repeat("x", 129)) {
		t.Fatal("password character limit incorrect")
	}
	hash := hashPassword(password)
	if !verifyPassword(hash, password) || verifyPassword(hash, "different password") {
		t.Fatal("password verification failed")
	}
	for _, invalid := range []string{"", "$argon2id$v=19$m=999999999,t=99999,p=100$salt$hash", "$argon2id$v=19$" + passwordParameters + "$invalid$invalid"} {
		if verifyPassword(invalid, password) {
			t.Fatal("accepted invalid PHC record")
		}
	}
}
