// Package web embeds and serves the compiled, same-origin browser application.
package web

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io/fs"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"nexa-home/internal/security"
)

// Run npm run build:web before compiling the executable.
//
//go:embed all:dist
var files embed.FS

const nonceMarker = "__NEXA_STYLE_NONCE__"

type resource struct {
	data              []byte
	contentType, etag string
}
type Handler struct {
	index     []byte
	resources map[string]resource
}

func New() (*Handler, error) { return newHandler(files) }
func newHandler(source fs.FS) (*Handler, error) {
	index, err := fs.ReadFile(source, "dist/index.html")
	if err != nil {
		return nil, err
	}
	if bytes.Count(index, []byte(nonceMarker)) != 1 {
		return nil, errors.New("compiled HTML must contain exactly one style nonce marker")
	}
	h := &Handler{index: index, resources: make(map[string]resource)}
	err = fs.WalkDir(source, "dist", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		name = strings.TrimPrefix(name, "dist/")
		if name != "theme-init.js" && name != "favicon.svg" && !(strings.HasPrefix(name, "static/") && (path.Ext(name) == ".js" || path.Ext(name) == ".css")) {
			return nil
		}
		data, err := fs.ReadFile(source, "dist/"+name)
		if err != nil {
			return err
		}
		mime := "text/javascript; charset=utf-8"
		if path.Ext(name) == ".css" {
			mime = "text/css; charset=utf-8"
		}
		if path.Ext(name) == ".svg" {
			mime = "image/svg+xml"
		}
		hash := sha256.Sum256(data)
		h.resources["/"+name] = resource{data, mime, `"` + hex.EncodeToString(hash[:]) + `"`}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if _, ok := h.resources["/theme-init.js"]; !ok {
		return nil, errors.New("compiled theme bootstrap is missing")
	}
	return h, nil
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	security.Headers(w)
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/")
	if name != "" && !fs.ValidPath(name) {
		http.NotFound(w, r)
		return
	}
	if file, ok := h.resources[r.URL.Path]; ok {
		r.Pattern = "GET /{static-file}"
		w.Header().Set("Content-Type", file.contentType)
		w.Header().Set("ETag", file.etag)
		cache := "public, max-age=0, must-revalidate"
		if strings.HasPrefix(name, "static/") {
			cache = "public, max-age=31536000, immutable"
		}
		w.Header().Set("Cache-Control", cache)
		http.ServeContent(w, r, path.Base(name), time.Time{}, bytes.NewReader(file.data))
		return
	}
	first, _, _ := strings.Cut(name, "/")
	if first == "api" || first == "assets" || first == "static" || first == "healthz" || first == "readyz" {
		r.Pattern = "GET /{missing-file}"
		http.NotFound(w, r)
		return
	}
	var random [32]byte
	_, _ = rand.Read(random[:])
	nonce := base64.StdEncoding.EncodeToString(random[:])
	policy := strings.Replace(w.Header().Get("Content-Security-Policy"), "style-src 'self';", "style-src 'self' 'nonce-"+nonce+"';", 1)
	w.Header().Set("Content-Security-Policy", policy)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	body := bytes.ReplaceAll(h.index, []byte(nonceMarker), []byte(nonce))
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	status := http.StatusOK
	r.Pattern = "GET /{page}"
	if !spaRoute(r.URL.Path) {
		status = http.StatusNotFound
		r.Pattern = "GET /{not-found}"
	}
	w.WriteHeader(status)
	if r.Method == http.MethodGet {
		_, _ = w.Write(body)
	}
}

func spaRoute(name string) bool {
	switch name {
	case "/", "/login", "/setup", "/admin", "/admin/categories", "/admin/tags", "/admin/appearance", "/admin/security", "/admin/backup":
		return true
	}
	return strings.HasPrefix(name, "/admin/services/") && strings.Count(name, "/") == 3 && !strings.HasSuffix(name, "/")
}
