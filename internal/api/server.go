// Package api serves the authenticated and public Nexa Home HTTP contract.
package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	contract "nexa-home/api"
	"nexa-home/internal/assets"
	"nexa-home/internal/auth"
	"nexa-home/internal/config"
	"nexa-home/internal/security"

	"github.com/google/uuid"
	"modernc.org/sqlite"
)

const JSONLimit = 128 << 10

type Server struct {
	database *sql.DB
	config   config.Config
	auth     *auth.Service
	contract *contract.Contract
	logger   *slog.Logger
	mux      *http.ServeMux
	assets   *assets.Store
	assetMu  sync.Mutex
	importMu sync.Mutex
	imports  map[[32]byte]*stagedImport
}

type handler func(http.ResponseWriter, *http.Request, auth.Session) error

type problem struct {
	status  int
	code    string
	message string
	details map[string]string
}

func (p *problem) Error() string { return p.code }

func invalid(field, message string) error {
	return &problem{status: 400, code: "VALIDATION_ERROR", message: "Invalid request", details: map[string]string{field: message}}
}
func conflict(message string) error { return &problem{status: 409, code: "CONFLICT", message: message} }
func missing() error                { return &problem{status: 404, code: "NOT_FOUND", message: "Resource not found"} }

type requestIDKey struct{}

var safeRequestID = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,64}$`)

// New does not log or retain the returned setup token; main prints it locally once.
func New(ctx context.Context, c config.Config, database *sql.DB, logger *slog.Logger) (*Server, string, error) {
	definition, err := contract.New()
	if err != nil {
		return nil, "", err
	}
	authentication, token, err := auth.New(ctx, database)
	if err != nil {
		return nil, "", err
	}
	if logger == nil {
		logger = slog.New(slog.NewJSONHandler(io.Discard, nil))
	}
	store, err := assets.Open(c.DataDir)
	if err != nil {
		return nil, "", err
	}
	s := &Server{database: database, config: c, auth: authentication, contract: definition, logger: logger, mux: http.NewServeMux(), assets: store, imports: make(map[[32]byte]*stagedImport)}
	if err := s.collectAssets(ctx); err != nil {
		store.Close()
		return nil, "", err
	}
	s.authRoutes()
	s.settingsRoutes()
	s.catalogRoutes()
	s.serviceRoutes()
	s.assetRoutes()
	s.backupRoutes()
	s.mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { s.fail(w, r, missing()) })
	return s, token, nil
}

func (s *Server) Close() error {
	s.importMu.Lock()
	for _, pending := range s.imports {
		pending.timer.Stop()
	}
	clear(s.imports)
	s.importMu.Unlock()
	return s.assets.Close()
}

func (s *Server) route(method, path string, authenticated bool, fn handler) {
	s.mux.HandleFunc(method+" "+path, func(w http.ResponseWriter, r *http.Request) {
		var session auth.Session
		var err error
		if authenticated {
			session, err = s.session(r)
			if err != nil {
				s.fail(w, r, err)
				return
			}
		}
		if method != http.MethodGet {
			if !security.SameOrigin(r, s.config) {
				s.fail(w, r, &problem{status: 403, code: "FORBIDDEN", message: "A same-origin request is required"})
				return
			}
			if authenticated {
				tokens := r.Header.Values("X-CSRF-Token")
				if len(tokens) != 1 || !auth.CheckCSRF(session, tokens[0]) {
					s.fail(w, r, &problem{status: 403, code: "CSRF_INVALID", message: "Invalid CSRF token"})
					return
				}
			}
		}
		if id := r.PathValue("id"); id != "" && !validID(id) {
			s.fail(w, r, invalid("id", "Expected a canonical UUIDv4"))
			return
		}
		if err := fn(w, r, session); err != nil {
			s.fail(w, r, err)
		}
	})
}

func validID(value string) bool {
	id, err := uuid.Parse(value)
	return err == nil && id.Version() == 4 && id.Variant() == uuid.RFC4122 && id.String() == value
}

func (s *Server) session(r *http.Request) (auth.Session, error) {
	cookies := r.CookiesNamed("nexa_session")
	if len(cookies) != 1 {
		return auth.Session{}, auth.ErrUnauthenticated
	}
	return s.auth.Authenticate(r.Context(), cookies[0].Value)
}

func (s *Server) decode(w http.ResponseWriter, r *http.Request, target any, limit int64) error {
	media, parameters, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" || (parameters["charset"] != "" && !strings.EqualFold(parameters["charset"], "utf-8")) {
		return invalid("body", "Content-Type must be application/json with UTF-8 encoding")
	}
	if encoding := r.Header.Get("Content-Encoding"); encoding != "" && encoding != "identity" {
		return invalid("body", "Compressed request bodies are not supported")
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, limit))
	if err != nil {
		return err
	}
	_, path, _ := strings.Cut(r.Pattern, " ")
	if err := s.contract.Decode(r.Method, path, body, target); err != nil {
		return &problem{status: 400, code: "VALIDATION_ERROR", message: "Invalid request", details: contract.FieldErrors(err)}
	}
	return nil
}

func jsonResponse(w http.ResponseWriter, status int, value any) error {
	body, err := json.Marshal(value)
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(append(body, '\n'))
	return nil
}

func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error) {
	p := &problem{status: 500, code: "INTERNAL_ERROR", message: "An internal error occurred"}
	var supplied *problem
	var bodyLimit *http.MaxBytesError
	var sqliteError *sqlite.Error
	switch {
	case errors.As(err, &supplied):
		p = supplied
	case errors.Is(err, auth.ErrUnauthenticated):
		p = &problem{status: 401, code: "UNAUTHENTICATED", message: "Invalid credentials or expired session"}
	case errors.Is(err, auth.ErrForbidden):
		p = &problem{status: 403, code: "FORBIDDEN", message: "Invalid or expired setup token"}
	case errors.Is(err, auth.ErrConflict):
		p = &problem{status: 409, code: "CONFLICT", message: "Administrator already initialized"}
	case errors.Is(err, auth.ErrRateLimited):
		p = &problem{status: 429, code: "RATE_LIMITED", message: "Too many attempts; retry in 15 minutes"}
		w.Header().Set("Retry-After", "900")
	case errors.Is(err, auth.ErrValidation):
		p = &problem{status: 400, code: "VALIDATION_ERROR", message: "Invalid username or password"}
	case errors.Is(err, assets.ErrTooLarge):
		p = &problem{status: 413, code: "LIMIT_EXCEEDED", message: "Icon exceeds the 1 MiB limit"}
	case errors.Is(err, assets.ErrInvalid):
		p = &problem{status: 400, code: "VALIDATION_ERROR", message: "Upload a valid PNG, WebP or safe SVG icon"}
	case errors.As(err, &bodyLimit):
		p = &problem{status: 413, code: "LIMIT_EXCEEDED", message: "Request body exceeds the size limit"}
	case errors.Is(err, sql.ErrNoRows):
		p = &problem{status: 404, code: "NOT_FOUND", message: "Resource not found"}
	case errors.As(err, &sqliteError):
		if sqliteError.Code()&255 == 19 {
			p = &problem{status: 409, code: "CONFLICT", message: "Duplicate value or invalid reference"}
		}
		if sqliteError.Code()&255 == 5 || sqliteError.Code()&255 == 6 {
			p = &problem{status: 409, code: "CONFLICT", message: "Database is busy; retry the request"}
		}
	}
	requestID, _ := r.Context().Value(requestIDKey{}).(string)
	if p.status == 500 {
		s.logger.ErrorContext(r.Context(), "request failed", "requestId", requestID, "code", p.code)
	}
	body := struct {
		Error struct {
			Code      string            `json:"code"`
			Message   string            `json:"message"`
			Details   map[string]string `json:"details,omitempty"`
			RequestID string            `json:"requestId"`
		} `json:"error"`
	}{}
	body.Error.Code = p.code
	body.Error.Message = p.message
	body.Error.Details = p.details
	body.Error.RequestID = requestID
	_ = jsonResponse(w, p.status, body)
}

type responseStatus struct {
	http.ResponseWriter
	status int
}

func (w *responseStatus) WriteHeader(status int) {
	if w.status != 0 {
		return
	}
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
func (w *responseStatus) Write(body []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(200)
	}
	return w.ResponseWriter.Write(body)
}
func (w *responseStatus) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	security.Headers(w)
	w.Header().Set("Cache-Control", "no-store")
	requestID := r.Header.Get("X-Request-ID")
	if !safeRequestID.MatchString(requestID) || len(r.Header.Values("X-Request-ID")) != 1 {
		requestID = uuid.NewString()
	}
	w.Header().Set("X-Request-ID", requestID)
	r = r.WithContext(context.WithValue(r.Context(), requestIDKey{}, requestID))
	response := &responseStatus{ResponseWriter: w}
	defer func() {
		if recover() != nil && response.status == 0 {
			s.fail(response, r, errors.New("handler panic"))
		}
		pattern := r.Pattern
		if pattern == "" {
			pattern = "unmatched"
		}
		s.logger.InfoContext(r.Context(), "request", "requestId", requestID, "method", r.Method, "route", pattern, "status", response.status, "elapsedMs", time.Since(started).Milliseconds())
	}()
	s.mux.ServeHTTP(response, r)
}
