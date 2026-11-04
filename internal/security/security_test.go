package security

import (
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"

	"nexa-home/internal/config"
)

func TestURL(t *testing.T) {
	for _, test := range []struct{ input, want string }{
		{"https://photos.example.com", "https://photos.example.com"},
		{"http://192.168.1.10:5000", "http://192.168.1.10:5000"},
		{"http://localhost:8080/a?b=c#d", "http://localhost:8080/a?b=c#d"},
		{"https://例子.台灣/相片", "https://xn--fsqu00a.xn--kpry57d/%E7%9B%B8%E7%89%87"},
		{"http://[fd00::1]:8080", "http://[fd00::1]:8080"},
		{"http://[::1]", "http://[::1]"},
		{"https://EXAMPLE.COM./hello%20world", "https://example.com/hello%20world"},
	} {
		got, err := URL(test.input)
		if err != nil || got != test.want {
			t.Errorf("%q => %q, %v; want %q", test.input, got, err, test.want)
		}
	}
	for _, input := range []string{
		"javascript:alert(1)", "data:text/html,hello", "file:///etc/passwd", "//example.com", "/relative",
		"https://user:password@example.com", "https://user@example.com", "https://example.com/\r\nHeader:x",
		"https://example.com/%0a", "https://example.com?q=%00", "https://example.com/%5cfoo", "https://example.com\\@evil.com",
		" https://example.com", "https://", "https://example.com:0", "https://example.com:65536", "https://example.com:",
		"http://127.1", "http://2130706433", "http://0x7f000001", "http://0177.0.0.1", "http://1.2.3.999",
		"http://[fe80::1%25eth0]", "http://bad_host", "http://-bad.example", "http://a..example", "http://::1",
		"http://[example.com]", "https://example.com/" + strings.Repeat("x", 2048),
	} {
		if got, err := URL(input); err == nil {
			t.Errorf("accepted unsafe/ambiguous URL %q as %q", input, got)
		}
	}
}

func TestOrigin(t *testing.T) {
	c := config.Config{PublicOrigin: "https://home.example.com"}
	for _, test := range []struct {
		origin, referer, site string
		valid                 bool
	}{
		{"https://home.example.com", "", "same-origin", true},
		{"", "https://home.example.com/admin", "", true},
		{"https://evil.example", "", "", false},
		{"null", "", "", false},
		{"", "", "", false},
		{"https://home.example.com:443", "", "", false},
		{"https://home.example.com/", "", "", false},
		{"https://home.example.com", "", "cross-site", false},
		{"", "https://home.example.com.evil.test/admin", "", false},
		{"", "https://user@home.example.com/admin", "", false},
	} {
		r := httptest.NewRequest("POST", "http://internal:8080/api/v1/setup", nil)
		if test.origin != "" {
			r.Header.Set("Origin", test.origin)
		}
		if test.referer != "" {
			r.Header.Set("Referer", test.referer)
		}
		r.Header.Set("Sec-Fetch-Site", test.site)
		r.Header.Set("X-Forwarded-Host", "evil.example")
		if SameOrigin(r, c) != test.valid {
			t.Errorf("unexpected result: %+v", test)
		}
	}
	r := httptest.NewRequest("POST", "http://nas:8080/api/v1/setup", nil)
	r.Header.Set("Origin", "http://nas:8080")
	if !SameOrigin(r, config.Config{}) {
		t.Fatal("valid direct origin rejected")
	}
	r.Header.Add("Origin", "http://nas:8080")
	if SameOrigin(r, config.Config{}) {
		t.Fatal("ambiguous duplicate Origin accepted")
	}
}

func TestTrustedProxy(t *testing.T) {
	prefixes := []netip.Prefix{netip.MustParsePrefix("10.0.0.0/8")}
	for _, test := range []struct{ peer, forwarded, want string }{
		{"192.0.2.1:123", "1.1.1.1", "192.0.2.1"},
		{"10.0.0.1:123", "192.0.2.1", "192.0.2.1"},
		{"10.0.0.1:123", "1.1.1.1, 192.0.2.1, 10.0.0.2", "192.0.2.1"},
		{"10.0.0.1:123", "bad", "10.0.0.1"},
		{"10.0.0.1:123", "", "10.0.0.1"},
		{"[::ffff:10.0.0.1]:123", "192.0.2.2", "192.0.2.2"},
		{"not-a-peer", "1.1.1.1", "unknown"},
	} {
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = test.peer
		if test.forwarded != "" {
			r.Header.Set("X-Forwarded-For", test.forwarded)
		}
		if got := ClientIP(r, prefixes); got != test.want {
			t.Errorf("%+v => %q", test, got)
		}
	}
}

func TestTextColorAndHeaders(t *testing.T) {
	if !Text("相片", 1, 2) || Text("  ", 1, 10) || Text("bad\x00", 1, 20) || Text("too long", 1, 2) {
		t.Fatal("invalid text validation")
	}
	if !Color("#abcDEF") || Color("red") || Color("#123") {
		t.Fatal("invalid color validation")
	}
	w := httptest.NewRecorder()
	Headers(w)
	for _, header := range []string{"Content-Security-Policy", "Referrer-Policy", "X-Content-Type-Options", "X-Frame-Options", "Permissions-Policy"} {
		if w.Header().Get(header) == "" {
			t.Fatal("missing " + header)
		}
	}
}
