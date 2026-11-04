package config

import "testing"

func TestLoad(t *testing.T) {
	defaults, err := Load(func(string) string { return "" })
	if err != nil || defaults.Listen != "0.0.0.0:8080" || defaults.AllowHTTPCookie || defaults.DataDir != "/data" {
		t.Fatalf("unsafe defaults: %+v, %v", defaults, err)
	}
	for _, test := range []struct {
		name  string
		env   map[string]string
		valid bool
	}{
		{"https", map[string]string{"NEXA_PUBLIC_ORIGIN": "https://home.example.com/", "NEXA_TRUSTED_PROXY_CIDRS": "10.0.0.0/8,fd00::/8"}, true},
		{"lan", map[string]string{"NEXA_PUBLIC_ORIGIN": "http://nas.local:8080", "NEXA_ALLOW_HTTP_COOKIE": "true"}, true},
		{"http default", map[string]string{"NEXA_PUBLIC_ORIGIN": "http://nas.local"}, false},
		{"origin path", map[string]string{"NEXA_PUBLIC_ORIGIN": "https://home.example.com/admin"}, false},
		{"origin credentials", map[string]string{"NEXA_PUBLIC_ORIGIN": "https://user:pass@home.example.com"}, false},
		{"origin query", map[string]string{"NEXA_PUBLIC_ORIGIN": "https://home.example.com?x=y"}, false},
		{"origin fragment", map[string]string{"NEXA_PUBLIC_ORIGIN": "https://home.example.com/#x"}, false},
		{"proxy missing origin", map[string]string{"NEXA_TRUSTED_PROXY_CIDRS": "10.0.0.0/8"}, false},
		{"proxy invalid", map[string]string{"NEXA_TRUSTED_PROXY_CIDRS": "not-a-cidr"}, false},
		{"proxy all", map[string]string{"NEXA_TRUSTED_PROXY_CIDRS": "0.0.0.0/0"}, false},
		{"relative data", map[string]string{"NEXA_DATA_DIR": "./data"}, false},
		{"invalid listen", map[string]string{"NEXA_LISTEN": "localhost"}, false},
		{"invalid port", map[string]string{"NEXA_LISTEN": "localhost:0"}, false},
		{"invalid bool", map[string]string{"NEXA_ALLOW_HTTP_COOKIE": "yes"}, false},
		{"invalid log", map[string]string{"NEXA_LOG_LEVEL": "trace"}, false},
		{"debug", map[string]string{"NEXA_LOG_LEVEL": "debug"}, true},
		{"warn", map[string]string{"NEXA_LOG_LEVEL": "warn"}, true},
		{"error", map[string]string{"NEXA_LOG_LEVEL": "error"}, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, err := Load(func(key string) string { return test.env[key] })
			if (err == nil) != test.valid {
				t.Fatalf("valid=%v, err=%v", test.valid, err)
			}
		})
	}
}
