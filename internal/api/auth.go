package api

import (
	"net/http"
	"strings"
	"time"

	"nexa-home/internal/auth"
	"nexa-home/internal/security"
)

func (s *Server) authRoutes() {
	s.route("GET", "/healthz", false, func(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
		return jsonResponse(w, 200, map[string]string{"status": "ok"})
	})
	s.route("GET", "/readyz", false, func(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
		if err := s.database.PingContext(r.Context()); err != nil {
			return &problem{status: 503, code: "INTERNAL_ERROR", message: "Database is not ready"}
		}
		return jsonResponse(w, 200, map[string]string{"status": "ready"})
	})
	s.route("GET", "/api/v1/setup/status", false, func(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
		initialized, err := s.auth.Initialized(r.Context())
		if err != nil {
			return err
		}
		return jsonResponse(w, 200, map[string]bool{"initialized": initialized})
	})
	s.route("POST", "/api/v1/setup", false, func(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
		var input struct {
			Token    string `json:"token"`
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := s.decode(w, r, &input, JSONLimit); err != nil {
			return err
		}
		if err := s.auth.Setup(r.Context(), input.Token, input.Username, input.Password, security.ClientIP(r, s.config.TrustedProxies)); err != nil {
			return err
		}
		return jsonResponse(w, 201, map[string]bool{"initialized": true})
	})
	s.route("POST", "/api/v1/auth/login", false, func(w http.ResponseWriter, r *http.Request, _ auth.Session) error {
		var input struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := s.decode(w, r, &input, JSONLimit); err != nil {
			return err
		}
		token, session, err := s.auth.Login(r.Context(), input.Username, input.Password, security.ClientIP(r, s.config.TrustedProxies), r.UserAgent())
		if err != nil {
			return err
		}
		s.cookie(w, r, token)
		return jsonResponse(w, 200, map[string]string{"csrfToken": session.CSRFToken})
	})
	s.route("GET", "/api/v1/auth/me", true, func(w http.ResponseWriter, r *http.Request, session auth.Session) error {
		return jsonResponse(w, 200, map[string]string{"username": session.Username, "csrfToken": session.CSRFToken})
	})
	s.route("POST", "/api/v1/auth/logout", true, func(w http.ResponseWriter, r *http.Request, session auth.Session) error {
		if err := s.auth.Logout(r.Context(), session); err != nil {
			return err
		}
		s.cookie(w, r, "")
		w.WriteHeader(204)
		return nil
	})
	s.route("PUT", "/api/v1/auth/password", true, func(w http.ResponseWriter, r *http.Request, session auth.Session) error {
		var input struct {
			CurrentPassword string `json:"currentPassword"`
			NewPassword     string `json:"newPassword"`
		}
		if err := s.decode(w, r, &input, JSONLimit); err != nil {
			return err
		}
		if err := s.auth.ChangePassword(r.Context(), session, input.CurrentPassword, input.NewPassword, security.ClientIP(r, s.config.TrustedProxies)); err != nil {
			return err
		}
		s.cookie(w, r, "")
		w.WriteHeader(204)
		return nil
	})
}

func (s *Server) cookie(w http.ResponseWriter, r *http.Request, value string) {
	cookie := &http.Cookie{Name: "nexa_session", Value: value, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Secure: !s.config.AllowHTTPCookie || r.TLS != nil || strings.HasPrefix(s.config.PublicOrigin, "https://"),
		MaxAge: int(auth.AbsoluteLifetime.Seconds()), Expires: time.Now().Add(auth.AbsoluteLifetime).UTC()}
	if value == "" {
		cookie.MaxAge = -1
		cookie.Expires = time.Unix(1, 0).UTC()
	}
	http.SetCookie(w, cookie)
}
