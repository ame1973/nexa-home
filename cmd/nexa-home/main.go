// Nexa Home serves one embedded application and one private local data directory.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"nexa-home/internal/api"
	"nexa-home/internal/config"
	"nexa-home/internal/db"
	"nexa-home/internal/lifecycle"
	"nexa-home/internal/web"
)

var version = "1.0.0"

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, os.Args[1:], os.Getenv, os.Stderr); err != nil {
		_ = json.NewEncoder(os.Stderr).Encode(map[string]string{"time": time.Now().UTC().Format(time.RFC3339Nano), "level": "ERROR", "msg": err.Error()})
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string, getenv func(string) string, output io.Writer) error {
	if len(args) > 1 {
		return errors.New("usage: nexa-home [serve|healthcheck|doctor|version|help]")
	}
	command := "serve"
	if len(args) == 1 {
		command = args[0]
	}
	switch command {
	case "help", "--help", "-h":
		_, err := fmt.Fprintln(output, "Usage: nexa-home [serve|healthcheck|doctor|version|help]\nConfigure NEXA_LISTEN, NEXA_DATA_DIR, NEXA_PUBLIC_ORIGIN, NEXA_TRUSTED_PROXY_CIDRS, NEXA_ALLOW_HTTP_COOKIE and NEXA_LOG_LEVEL through the environment.\nThe Linux data directory must be private and owned by the process user. doctor requires the server to be stopped.")
		return err
	case "version", "--version":
		_, err := fmt.Fprintln(output, "Nexa Home "+version)
		return err
	case "serve", "healthcheck", "doctor":
	default:
		return errors.New("unknown command; use nexa-home help")
	}
	c, err := config.Load(getenv)
	if err != nil {
		return err
	}
	if command == "healthcheck" {
		return healthcheck(ctx, c)
	}
	if command == "doctor" {
		return doctor(ctx, c, output)
	}
	logger := slog.New(slog.NewJSONHandler(output, &slog.HandlerOptions{Level: c.LogLevel, ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
		if a.Key == slog.TimeKey {
			a.Value = slog.TimeValue(a.Value.Time().UTC())
		}
		return a
	}}))
	return serve(ctx, c, logger, output)
}

func doctor(ctx context.Context, c config.Config, output io.Writer) (err error) {
	// A mistyped path must not initialize an empty database and report success.
	if _, err := os.Stat(filepath.Join(c.DataDir, "nexa.db")); err != nil {
		return fmt.Errorf("doctor requires an existing stopped data directory: %w", err)
	}
	lock, err := lifecycle.Acquire(c.DataDir)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, lock.Close()) }()
	database, err := db.Open(ctx, c.DataDir)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, database.Close()) }()
	if err := api.CheckData(ctx, database, c.DataDir); err != nil {
		return err
	}
	_, err = fmt.Fprintln(output, "Database schema, integrity, foreign keys and icon files are valid.")
	return err
}

func serve(ctx context.Context, c config.Config, logger *slog.Logger, output io.Writer) (err error) {
	frontend, err := web.New()
	if err != nil {
		return fmt.Errorf("load embedded frontend: %w", err)
	}
	lock, err := lifecycle.Acquire(c.DataDir)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, lock.Close()) }()
	database, err := db.Open(ctx, c.DataDir)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, database.Close()) }()
	application, token, err := api.New(ctx, c, database, logger, frontend)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, application.Close()) }()
	listener, err := net.Listen("tcp", c.Listen)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	defer listener.Close()
	server := &http.Server{Handler: application, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 5 * time.Minute, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10, ErrorLog: slog.NewLogLogger(logger.Handler(), slog.LevelError)}
	if c.AllowHTTPCookie {
		// Security warnings and first-run credentials bypass log-level filtering.
		if err := json.NewEncoder(output).Encode(map[string]string{"time": time.Now().UTC().Format(time.RFC3339Nano), "level": "WARN", "msg": "HTTP session cookies are enabled; use only on an isolated trusted LAN"}); err != nil {
			return err
		}
	}
	if token != "" {
		if err := json.NewEncoder(output).Encode(map[string]string{"time": time.Now().UTC().Format(time.RFC3339Nano), "level": "INFO", "msg": "One-time setup token; expires in 30 minutes; open /setup locally", "setupToken": token}); err != nil {
			return err
		}
		token = ""
	}
	logger.Info("listening", "address", listener.Addr().String(), "version", version)
	stopped := make(chan error, 1)
	go func() { stopped <- server.Serve(listener) }()
	select {
	case err := <-stopped:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		logger.Info("shutting down")
		deadline, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := server.Shutdown(deadline); err != nil {
			return errors.Join(fmt.Errorf("HTTP shutdown: %w", err), server.Close())
		}
		if err := <-stopped; err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}

func healthcheck(ctx context.Context, c config.Config) error {
	host, port, err := net.SplitHostPort(c.Listen)
	if err != nil {
		return err
	}
	if host == "" || host == "0.0.0.0" {
		host = "127.0.0.1"
	}
	if host == "::" {
		host = "::1"
	}
	request, err := http.NewRequestWithContext(ctx, "GET", "http://"+net.JoinHostPort(host, port)+"/readyz", nil)
	if err != nil {
		return err
	}
	transport := &http.Transport{Proxy: nil}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 3 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("readiness check: %w", err)
	}
	defer response.Body.Close()
	var result struct {
		Status string `json:"status"`
	}
	if response.StatusCode != 200 || json.NewDecoder(io.LimitReader(response.Body, 1024)).Decode(&result) != nil || result.Status != "ready" {
		return errors.New("application is not ready")
	}
	return nil
}
