package auth

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"strings"
	"time"

	"nexa-home/internal/db"
	"nexa-home/internal/security"
)

var (
	ErrUnauthenticated = errors.New("invalid credentials or expired session")
	ErrForbidden       = errors.New("invalid or expired setup token")
	ErrConflict        = errors.New("administrator already initialized")
	ErrRateLimited     = errors.New("too many authentication failures")
	ErrValidation      = errors.New("invalid username or password")
)

const (
	IdleLifetime     = 12 * time.Hour
	AbsoluteLifetime = 7 * 24 * time.Hour
	SetupLifetime    = 30 * time.Minute
	Lockout          = 15 * time.Minute
	MaxRateBuckets   = 4096
)

type Service struct {
	database          *sql.DB
	now               func() time.Time
	gate              chan struct{}
	setupHash         string
	setupExpires      time.Time
	dummyPasswordHash string
}

type Session struct {
	IDHash    string
	Username  string
	CSRFToken string
}

// New returns the one-time setup token only to the caller for local startup logs.
// Service retains its SHA-256 digest, never the plaintext token.
func New(ctx context.Context, database *sql.DB) (*Service, string, error) {
	s := &Service{database: database, now: time.Now, gate: make(chan struct{}, 1), dummyPasswordHash: hashPassword("unusable-dummy-password")}
	initialized, err := s.Initialized(ctx)
	if err != nil {
		return nil, "", err
	}
	if initialized {
		return s, "", nil
	}
	token := randomToken()
	s.setupHash = digest(token)
	s.setupExpires = s.now().Add(SetupLifetime)
	return s, token, nil
}

// ponytail: serialize password hashing for one admin to bound RAM and lockout races;
// replace with per-account gates only if multi-user authentication is introduced.
func (s *Service) acquire(ctx context.Context) error {
	select {
	case s.gate <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
func (s *Service) release() { <-s.gate }

func (s *Service) Initialized(ctx context.Context) (bool, error) {
	var initialized bool
	err := s.database.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM admin_account WHERE id=1)").Scan(&initialized)
	return initialized, err
}

func (s *Service) Setup(ctx context.Context, token, username, password, ip string) error {
	if err := s.acquire(ctx); err != nil {
		return err
	}
	defer s.release()
	initialized, err := s.Initialized(ctx)
	if err != nil {
		return err
	}
	if initialized {
		return ErrConflict
	}
	keys := []string{"setup:ip:" + ip}
	if err := s.checkRate(ctx, keys); err != nil {
		return err
	}
	if !tokenValid(token) || s.setupHash == "" || !s.now().Before(s.setupExpires) || subtle.ConstantTimeCompare([]byte(digest(token)), []byte(s.setupHash)) != 1 {
		if err := s.failure(ctx, keys); err != nil {
			return err
		}
		return ErrForbidden
	}
	if !security.Text(username, 3, 40) || strings.TrimSpace(username) != username || !validPassword(password) {
		return ErrValidation
	}
	hash := hashPassword(password)
	tx, err := s.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := s.now()
	stamp := db.Timestamp(now)
	result, err := tx.ExecContext(ctx, `INSERT INTO admin_account(id,username,password_hash,password_updated_at,created_at,updated_at) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`, username, hash, stamp, stamp, stamp)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return ErrConflict
	}
	if err := db.Audit(ctx, tx, now, "setup.complete", "admin", "1"); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.setupHash = ""
	return nil
}

func (s *Service) Login(ctx context.Context, username, password, ip, userAgent string) (string, Session, error) {
	if err := s.acquire(ctx); err != nil {
		return "", Session{}, err
	}
	defer s.release()
	// There is one account. Failed unknown names share its bucket to prevent aliases bypassing lockout.
	keys := []string{"login:ip:" + ip, "login:account:1"}
	if err := s.checkRate(ctx, keys); err != nil {
		return "", Session{}, err
	}
	var storedName, hash string
	err := s.database.QueryRowContext(ctx, "SELECT username,password_hash FROM admin_account WHERE id=1").Scan(&storedName, &hash)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", Session{}, err
	}
	if hash == "" {
		hash = s.dummyPasswordHash
	}
	// Even an unknown username follows the same expensive verification path.
	valid := verifyPassword(hash, password)
	if !valid || !validPassword(password) || storedName == "" || !strings.EqualFold(username, storedName) {
		if err := s.failure(ctx, keys); err != nil {
			return "", Session{}, err
		}
		return "", Session{}, ErrUnauthenticated
	}
	token := randomToken()
	session := Session{IDHash: digest(token), Username: storedName, CSRFToken: csrfToken(token)}
	tx, err := s.database.BeginTx(ctx, nil)
	if err != nil {
		return "", Session{}, err
	}
	defer tx.Rollback()
	now := s.now()
	// Keep persistent authentication state bounded without extending absolute expiry.
	if _, err := tx.ExecContext(ctx, `DELETE FROM admin_sessions WHERE expires_at<=? OR last_seen_at<=? OR revoked_at IS NOT NULL`, db.Timestamp(now), db.Timestamp(now.Add(-IdleLifetime))); err != nil {
		return "", Session{}, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM admin_sessions WHERE id_hash IN (SELECT id_hash FROM admin_sessions ORDER BY created_at DESC,id_hash LIMIT -1 OFFSET 31)`); err != nil {
		return "", Session{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO admin_sessions(id_hash,created_at,last_seen_at,expires_at,csrf_secret_hash,user_agent_hash) VALUES(?,?,?,?,?,?)`, session.IDHash, db.Timestamp(now), db.Timestamp(now), db.Timestamp(now.Add(AbsoluteLifetime)), digest(session.CSRFToken), digest(userAgent)); err != nil {
		return "", Session{}, err
	}
	for _, key := range keys {
		if _, err := tx.ExecContext(ctx, "DELETE FROM auth_rate_limits WHERE key_hash=?", digest(key)); err != nil {
			return "", Session{}, err
		}
	}
	if err := db.Audit(ctx, tx, now, "auth.login", "admin", "1"); err != nil {
		return "", Session{}, err
	}
	if err := tx.Commit(); err != nil {
		return "", Session{}, err
	}
	return token, session, nil
}

func (s *Service) Authenticate(ctx context.Context, token string) (Session, error) {
	if !tokenValid(token) {
		return Session{}, ErrUnauthenticated
	}
	session := Session{IDHash: digest(token), CSRFToken: csrfToken(token)}
	tx, err := s.database.BeginTx(ctx, nil)
	if err != nil {
		return Session{}, err
	}
	defer tx.Rollback()
	var seen, expires, csrfHash string
	err = tx.QueryRowContext(ctx, `SELECT s.last_seen_at,s.expires_at,s.csrf_secret_hash,a.username FROM admin_sessions s CROSS JOIN admin_account a WHERE s.id_hash=? AND s.revoked_at IS NULL AND a.id=1`, session.IDHash).Scan(&seen, &expires, &csrfHash, &session.Username)
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, ErrUnauthenticated
	}
	if err != nil {
		return Session{}, err
	}
	lastSeen, err := time.Parse(time.RFC3339Nano, seen)
	if err != nil {
		return Session{}, err
	}
	deadline, err := time.Parse(time.RFC3339Nano, expires)
	if err != nil {
		return Session{}, err
	}
	now := s.now()
	if !now.Before(deadline) || !now.Before(lastSeen.Add(IdleLifetime)) || subtle.ConstantTimeCompare([]byte(digest(session.CSRFToken)), []byte(csrfHash)) != 1 {
		return Session{}, ErrUnauthenticated
	}
	if _, err := tx.ExecContext(ctx, "UPDATE admin_sessions SET last_seen_at=? WHERE id_hash=?", db.Timestamp(now), session.IDHash); err != nil {
		return Session{}, err
	}
	if err := tx.Commit(); err != nil {
		return Session{}, err
	}
	return session, nil
}

func CheckCSRF(session Session, supplied string) bool {
	return tokenValid(supplied) && subtle.ConstantTimeCompare([]byte(session.CSRFToken), []byte(supplied)) == 1
}

func (s *Service) Logout(ctx context.Context, session Session) error {
	tx, err := s.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "DELETE FROM admin_sessions WHERE id_hash=?", session.IDHash); err != nil {
		return err
	}
	if err := db.Audit(ctx, tx, s.now(), "auth.logout", "admin", "1"); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) ChangePassword(ctx context.Context, session Session, current, next, ip string) error {
	if err := s.acquire(ctx); err != nil {
		return err
	}
	defer s.release()
	keys := []string{"password:ip:" + ip, "password:account:1"}
	if err := s.checkRate(ctx, keys); err != nil {
		return err
	}
	var hash string
	if err := s.database.QueryRowContext(ctx, "SELECT password_hash FROM admin_account WHERE id=1").Scan(&hash); err != nil {
		return err
	}
	if !verifyPassword(hash, current) {
		if err := s.failure(ctx, keys); err != nil {
			return err
		}
		return ErrUnauthenticated
	}
	if !validPassword(next) {
		return ErrValidation
	}
	newHash := hashPassword(next)
	tx, err := s.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var valid bool
	if err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM admin_sessions WHERE id_hash=? AND revoked_at IS NULL)", session.IDHash).Scan(&valid); err != nil {
		return err
	}
	if !valid {
		return ErrUnauthenticated
	}
	now := s.now()
	if _, err := tx.ExecContext(ctx, "UPDATE admin_account SET password_hash=?,password_updated_at=?,updated_at=? WHERE id=1", newHash, db.Timestamp(now), db.Timestamp(now)); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM admin_sessions"); err != nil {
		return err
	}
	if err := db.Audit(ctx, tx, now, "auth.password.change", "admin", "1"); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) checkRate(ctx context.Context, keys []string) error {
	// Cleanup precedes the capacity check so a saturated table recovers after expiry.
	now := s.now()
	if _, err := s.database.ExecContext(ctx, "DELETE FROM auth_rate_limits WHERE window_started_at<=? AND (locked_until IS NULL OR locked_until<=?)", db.Timestamp(now.Add(-Lockout)), db.Timestamp(now)); err != nil {
		return err
	}
	var count int
	if err := s.database.QueryRowContext(ctx, "SELECT COUNT(*) FROM auth_rate_limits").Scan(&count); err != nil {
		return err
	}
	if count+len(keys) > MaxRateBuckets {
		return ErrRateLimited
	}
	for _, key := range keys {
		var locked sql.NullString
		err := s.database.QueryRowContext(ctx, "SELECT locked_until FROM auth_rate_limits WHERE key_hash=?", digest(key)).Scan(&locked)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return err
		}
		if locked.Valid {
			until, err := time.Parse(time.RFC3339Nano, locked.String)
			if err != nil {
				return err
			}
			if s.now().Before(until) {
				return ErrRateLimited
			}
		}
	}
	return nil
}

func (s *Service) failure(ctx context.Context, keys []string) error {
	tx, err := s.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := s.now()
	for _, key := range keys {
		_, err := tx.ExecContext(ctx, `INSERT INTO auth_rate_limits(key_hash,failure_count,window_started_at) VALUES(?,1,?) ON CONFLICT(key_hash) DO UPDATE SET failure_count=failure_count+1`, digest(key), db.Timestamp(now))
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "UPDATE auth_rate_limits SET locked_until=? WHERE key_hash=? AND failure_count>=5", db.Timestamp(now.Add(Lockout)), digest(key)); err != nil {
			return err
		}
	}
	return tx.Commit()
}
