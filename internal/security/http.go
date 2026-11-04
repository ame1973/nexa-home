// Package security contains shared validation at HTTP and content boundaries.
package security

import (
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"

	"nexa-home/internal/config"
)

func trusted(address netip.Addr, prefixes []netip.Prefix) bool {
	for _, prefix := range prefixes {
		if prefix.Contains(address.Unmap()) {
			return true
		}
	}
	return false
}

// ClientIP walks only the trusted suffix of an X-Forwarded-For chain.
func ClientIP(r *http.Request, prefixes []netip.Prefix) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return "unknown"
	}
	peer, err := netip.ParseAddr(host)
	if err != nil {
		return "unknown"
	}
	peer = peer.Unmap()
	if !trusted(peer, prefixes) {
		return peer.String()
	}
	forwarded := r.Header.Values("X-Forwarded-For")
	if len(forwarded) != 1 {
		return peer.String()
	}
	parts := strings.Split(forwarded[0], ",")
	if len(parts) > 32 {
		return peer.String()
	}
	addresses := make([]netip.Addr, len(parts))
	for i, part := range parts {
		address, err := netip.ParseAddr(strings.TrimSpace(part))
		if err != nil {
			return peer.String()
		}
		addresses[i] = address.Unmap()
	}
	client := peer
	for i := len(addresses) - 1; i >= 0 && trusted(client, prefixes); i-- {
		client = addresses[i]
	}
	return client.String()
}

// SameOrigin deliberately ignores forwarded host/proto: a proxy must have an
// explicit public origin. Untrusted forwarding headers never change this check.
func SameOrigin(r *http.Request, c config.Config) bool {
	if site := r.Header.Get("Sec-Fetch-Site"); site == "cross-site" {
		return false
	}
	expected := c.PublicOrigin
	if expected == "" {
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		expected = scheme + "://" + r.Host
	}
	origins := r.Header.Values("Origin")
	if len(origins) != 0 {
		return len(origins) == 1 && origins[0] == expected
	}
	referers := r.Header.Values("Referer")
	if len(referers) != 1 {
		return false
	}
	referer, err := url.Parse(referers[0])
	if err != nil || referer.User != nil || referer.Host == "" {
		return false
	}
	return referer.Scheme+"://"+referer.Host == expected
}

func Headers(w http.ResponseWriter) {
	h := w.Header()
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("X-Frame-Options", "DENY")
	h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
	h.Set("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'")
}
