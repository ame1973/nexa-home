// Package config validates process configuration before accepting traffic.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/netip"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Listen          string
	DataDir         string
	PublicOrigin    string
	TrustedProxies  []netip.Prefix
	AllowHTTPCookie bool
	LogLevel        slog.Level
}

func Load(getenv func(string) string) (Config, error) {
	c := Config{Listen: "0.0.0.0:8080", DataDir: "/data", LogLevel: slog.LevelInfo}
	if value := getenv("NEXA_LISTEN"); value != "" {
		c.Listen = value
	}
	_, port, err := net.SplitHostPort(c.Listen)
	if err != nil {
		return c, errors.New("NEXA_LISTEN must be a host:port address")
	}
	if number, err := strconv.Atoi(port); err != nil || number < 1 || number > 65535 {
		return c, errors.New("NEXA_LISTEN port must be between 1 and 65535")
	}
	if value := getenv("NEXA_DATA_DIR"); value != "" {
		c.DataDir = value
	}
	if !filepath.IsAbs(c.DataDir) {
		return c, errors.New("NEXA_DATA_DIR must be absolute")
	}
	if value := getenv("NEXA_ALLOW_HTTP_COOKIE"); value != "" {
		if value != "true" && value != "false" {
			return c, errors.New("NEXA_ALLOW_HTTP_COOKIE must be true or false")
		}
		c.AllowHTTPCookie = value == "true"
	}
	if value := getenv("NEXA_PUBLIC_ORIGIN"); value != "" {
		origin, err := url.Parse(value)
		if err != nil || origin.User != nil || origin.Hostname() == "" || (origin.Scheme != "http" && origin.Scheme != "https") || (origin.Path != "" && origin.Path != "/") || origin.RawQuery != "" || origin.ForceQuery || origin.Fragment != "" || origin.Opaque != "" {
			return c, errors.New("NEXA_PUBLIC_ORIGIN must be an http(s) origin without credentials, path, query or fragment")
		}
		if origin.Scheme == "http" && !c.AllowHTTPCookie {
			return c, errors.New("HTTP origin requires explicit NEXA_ALLOW_HTTP_COOKIE=true on an isolated LAN")
		}
		c.PublicOrigin = origin.Scheme + "://" + origin.Host
	}
	if value := getenv("NEXA_TRUSTED_PROXY_CIDRS"); value != "" {
		for _, cidr := range strings.Split(value, ",") {
			prefix, err := netip.ParsePrefix(strings.TrimSpace(cidr))
			if err != nil {
				return c, errors.New("NEXA_TRUSTED_PROXY_CIDRS contains an invalid CIDR")
			}
			if prefix.Bits() == 0 {
				return c, errors.New("trusting every proxy is not allowed")
			}
			c.TrustedProxies = append(c.TrustedProxies, prefix.Masked())
		}
		if c.PublicOrigin == "" {
			return c, errors.New("trusted reverse proxies require NEXA_PUBLIC_ORIGIN")
		}
	}
	if value := getenv("NEXA_LOG_LEVEL"); value != "" {
		switch value {
		case "debug":
			c.LogLevel = slog.LevelDebug
		case "info":
			c.LogLevel = slog.LevelInfo
		case "warn":
			c.LogLevel = slog.LevelWarn
		case "error":
			c.LogLevel = slog.LevelError
		default:
			return c, fmt.Errorf("NEXA_LOG_LEVEL must be debug, info, warn or error")
		}
	}
	return c, nil
}
