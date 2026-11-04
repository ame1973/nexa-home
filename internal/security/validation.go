package security

import (
	"errors"
	"net"
	"net/netip"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/net/idna"
)

var numericHostLabel = regexp.MustCompile(`^(?:[0-9]+|0[xX][0-9a-fA-F]+)$`)
var hostLabel = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)
var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func Color(value string) bool { return hexColor.MatchString(value) }

func Text(value string, min, max int) bool {
	length := utf8.RuneCountInString(value)
	if !utf8.ValidString(value) || length < min || length > max || (min > 0 && strings.TrimSpace(value) == "") {
		return false
	}
	for _, r := range value {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}

// URL canonicalizes IDNA hostnames without resolving or fetching any address.
// Numeric host shorthands are rejected because browsers interpret them as IPs.
func URL(value string) (string, error) {
	invalid := errors.New("expected an absolute http(s) URL without credentials or control characters")
	if len(value) < 8 || len(value) > 2048 || !utf8.ValidString(value) || strings.TrimSpace(value) != value {
		return "", invalid
	}
	decoded, err := url.PathUnescape(value)
	if err != nil {
		return "", invalid
	}
	for _, r := range decoded {
		if unicode.IsControl(r) || r == '\\' {
			return "", invalid
		}
	}
	u, err := url.Parse(value)
	if err != nil || u.User != nil || u.Host == "" || u.Opaque != "" || (u.Scheme != "http" && u.Scheme != "https") {
		return "", invalid
	}
	host := u.Hostname()
	if host == "" || strings.Contains(host, "%") || strings.HasSuffix(u.Host, ":") {
		return "", invalid
	}
	if strings.Contains(host, ":") && !strings.HasPrefix(u.Host, "[") {
		return "", invalid
	}
	if address, err := netip.ParseAddr(host); err == nil {
		if address.Zone() != "" {
			return "", invalid
		}
		host = address.String()
	} else {
		if strings.ContainsAny(host, "[]:") {
			return "", invalid
		}
		host, err = idna.Lookup.ToASCII(host)
		if err != nil {
			return "", invalid
		}
		host = strings.ToLower(strings.TrimSuffix(host, "."))
		if len(host) == 0 || len(host) > 253 {
			return "", invalid
		}
		labels := strings.Split(host, ".")
		if numericHostLabel.MatchString(labels[len(labels)-1]) {
			return "", invalid
		}
		for _, label := range labels {
			if !hostLabel.MatchString(label) {
				return "", invalid
			}
		}
	}
	if port := u.Port(); port != "" {
		number, err := strconv.Atoi(port)
		if err != nil || number < 1 || number > 65535 {
			return "", invalid
		}
		u.Host = net.JoinHostPort(host, strconv.Itoa(number))
	} else if strings.Contains(host, ":") {
		u.Host = "[" + host + "]"
	} else {
		u.Host = host
	}
	result := u.String()
	if len(result) > 2048 {
		return "", invalid
	}
	return result, nil
}
