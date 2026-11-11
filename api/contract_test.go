package contract

import (
	"strings"
	"testing"
)

func TestContract(t *testing.T) {
	c, err := New()
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Operations()) != 33 {
		t.Fatalf("want 33 operations, got %d", len(c.Operations()))
	}
	for _, test := range []struct {
		name, body string
		valid      bool
	}{
		{"valid", `{"name":"Archive","description":"","icon":"archive","isVisible":true}`, true},
		{"missing", `{"name":"Archive"}`, false},
		{"unknown", `{"name":"Archive","description":"","icon":"archive","isVisible":true,"id":"chosen"}`, false},
		{"case alias", `{"Name":"Archive","description":"","icon":"archive","isVisible":true}`, false},
		{"duplicate", `{"name":"Archive","name":"Other","description":"","icon":"archive","isVisible":true}`, false},
		{"wrong type", `{"name":"Archive","description":"","icon":"archive","isVisible":1}`, false},
		{"null", `null`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			var target any
			err := c.Decode("POST", "/api/v1/admin/categories", []byte(test.body), &target)
			if (err == nil) != test.valid {
				t.Fatalf("valid=%v, error=%v", test.valid, err)
			}
			if err != nil && len(FieldErrors(err)) == 0 {
				t.Fatal("missing safe field errors")
			}
		})
	}
	if err := c.ValidateResponse("GET", "/healthz", 200, []byte(`{"status":"ok"}`)); err != nil {
		t.Fatal(err)
	}
	for _, body := range []string{`{"status":"wrong"}`, `{"status":"ok","secret":"leak"}`} {
		if c.ValidateResponse("GET", "/healthz", 200, []byte(body)) == nil {
			t.Fatal("response drift accepted")
		}
	}
	if c.ValidateResponse("GET", "/healthz", 418, nil) == nil {
		t.Fatal("undocumented status accepted")
	}
	if c.ValidateResponse("POST", "/api/v1/auth/logout", 204, []byte("null")) == nil {
		t.Fatal("nonempty 204 accepted")
	}
}

func TestStrictJSON(t *testing.T) {
	for _, invalid := range []string{
		`{"nested":{"x":1,"x":2}}`, `{"x":1} {"y":2}`, ``, `{`, `[] true`,
		`{"x":"` + string([]byte{0xff}) + `"}`, strings.Repeat("[", 66) + "0" + strings.Repeat("]", 66),
	} {
		if _, err := StrictJSON([]byte(invalid)); err == nil {
			t.Fatalf("accepted invalid JSON: %q", invalid)
		}
	}
	for _, valid := range []string{`{"a":[1,true,null,"x",{}]}`, `[]`, `1`, `"hi"`} {
		if _, err := StrictJSON([]byte(valid)); err != nil {
			t.Fatal(err)
		}
	}
}

func FuzzStrictJSON(f *testing.F) {
	for _, seed := range []string{`{}`, `{"a":[1]}`, `{"x":1,"x":2}`, `null`} {
		f.Add([]byte(seed))
	}
	f.Fuzz(func(t *testing.T, input []byte) {
		_, _ = StrictJSON(input)
	})
}
