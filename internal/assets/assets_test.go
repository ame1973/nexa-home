package assets

import (
	"bytes"
	"encoding/base64"
	"errors"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"
)

const safeSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>Home &amp; archive</title><path d="M2 12 L12 2 L22 12 Z" fill="#8b9fff"/><circle cx="12" cy="16" r="2" fill="none" stroke="currentColor"/></svg>`

func pngBytes(t *testing.T, width, height int) []byte {
	t.Helper()
	value := image.NewNRGBA(image.Rect(0, 0, width, height))
	value.Set(0, 0, color.NRGBA{R: 255, A: 255})
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, value); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func TestImageValidation(t *testing.T) {
	data := pngBytes(t, 16, 16)
	validated, err := Validate(append(data, []byte("ignored untrusted metadata")...))
	if err != nil || validated.MIME != "image/png" || validated.Width != 16 || validated.Height != 16 || bytes.Contains(validated.Data, []byte("untrusted")) {
		t.Fatalf("PNG normalization: %+v %v", validated, err)
	}
	second, err := Validate(validated.Data)
	if err != nil || second.SHA256 != validated.SHA256 {
		t.Fatal("PNG normalization not idempotent", err)
	}
	webpData, err := base64.StdEncoding.DecodeString("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==")
	if err != nil {
		t.Fatal(err)
	}
	webpImage, err := Validate(webpData)
	if err != nil || webpImage.MIME != "image/webp" || webpImage.Width != 1 || webpImage.Height != 1 {
		t.Fatalf("WebP validation: %+v %v", webpImage, err)
	}
	for _, invalid := range [][]byte{nil, []byte("not an image"), []byte("\xff\xd8\xffjpeg"), pngBytes(t, 513, 1), pngBytes(t, 1, 513), append(webpData, 0), data[:20]} {
		if _, err := Validate(invalid); !errors.Is(err, ErrInvalid) {
			t.Fatalf("accepted invalid image (%d bytes): %v", len(invalid), err)
		}
	}
	if _, err := Validate(make([]byte, MaxBytes+1)); !errors.Is(err, ErrTooLarge) {
		t.Fatal(err)
	}
}

func TestSafeSVGSubset(t *testing.T) {
	validated, err := Validate([]byte(safeSVG))
	if err != nil || validated.MIME != "image/svg+xml" {
		t.Fatal(err)
	}
	second, err := Validate(validated.Data)
	if err != nil || !bytes.Equal(validated.Data, second.Data) {
		t.Fatal("SVG normalization not idempotent", err)
	}
	withDeclaration := `<?xml version="1.0" encoding="UTF-8"?><!-- private note -->` + safeSVG
	validated, err = Validate([]byte(withDeclaration))
	if err != nil || bytes.Contains(validated.Data, []byte("private note")) {
		t.Fatal("XML metadata not stripped", err)
	}
	for _, attack := range []string{
		`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>`,
		`<svg><script>alert(1)</script></svg>`,
		`<svg><foreignObject><div>HTML</div></foreignObject></svg>`,
		`<svg><image href="http://127.0.0.1/private"/></svg>`,
		`<svg><use href="#recursive"/></svg>`,
		`<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>`,
		`<svg><set attributeName="onload" to="alert(1)"/></svg>`,
		`<svg style="background:url(https://evil.example)"/>`,
		`<svg><path fill="url(https://evil.example)" d="M0 0"/></svg>`,
		`<svg><path fill="&#117;rl(https://evil.example)" d="M0 0"/></svg>`,
		`<svg xmlns:xlink="http://www.w3.org/1999/xlink"><path xlink:href="https://evil.example"/></svg>`,
		`<svg xml:base="https://evil.example"/>`,
		`<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg><title>&x;</title></svg>`,
		`<?xml-stylesheet href="https://evil.example/style.css"?><svg/>`,
		`<svg xmlns="http://www.w3.org/1999/xhtml"/>`,
		`<svg><svg/></svg>`, `<svg/><svg/>`, `<svg>unexpected text</svg>`,
		`<svg><circle r="1e999"/></svg>`, `<svg width="1" width="2"/>`,
		`<svg><path d="` + strings.Repeat("0 ", 9000) + `"/></svg>`,
		`<svg>` + strings.Repeat("<g>", 33) + strings.Repeat("</g>", 33) + `</svg>`,
		`<svg>` + strings.Repeat("<path d=\"M0 0\"/>", 2048) + `</svg>`,
	} {
		if _, err := Validate([]byte(attack)); !errors.Is(err, ErrInvalid) {
			t.Fatalf("accepted active/unsafe SVG: %s (%v)", attack[:min(100, len(attack))], err)
		}
	}
}

func TestStoreDeduplicationContainmentAndGarbageCollection(t *testing.T) {
	directory := t.TempDir()
	store, err := Open(directory)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	image, err := Validate(pngBytes(t, 2, 2))
	if err != nil {
		t.Fatal(err)
	}
	created, err := store.Put(image)
	if err != nil || !created {
		t.Fatal(created, err)
	}
	created, err = store.Put(image)
	if err != nil || created {
		t.Fatal("duplicate storage", created, err)
	}
	read, err := store.Read(image.Path(), image.SHA256, len(image.Data))
	if err != nil || !bytes.Equal(read, image.Data) {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(directory, "assets", image.Path()))
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatal("insecure icon permissions", err)
	}
	for _, name := range []string{"../../secret", "/etc/passwd", image.SHA256 + ".png", "ff/" + image.SHA256 + ".png"} {
		if _, err := store.Read(name, image.SHA256, len(image.Data)); err == nil {
			t.Fatal("unsafe path read", name)
		}
		if err := store.Remove(name); err == nil {
			t.Fatal("unsafe path removed", name)
		}
	}
	orphan, err := Validate([]byte(safeSVG))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Put(orphan); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, "assets", "notes.txt"), []byte("keep unknown files"), 0o600); err != nil {
		t.Fatal(err)
	}
	temporary := filepath.Join(directory, "assets", image.SHA256[:2], "."+uuid.NewString()+".tmp")
	if err := os.WriteFile(temporary, []byte("partial"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := store.Collect(map[string]bool{image.Path(): true}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Read(orphan.Path(), orphan.SHA256, len(orphan.Data)); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("orphan not collected", err)
	}
	if _, err := os.Stat(temporary); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("temporary not collected", err)
	}
	if _, err := os.Stat(filepath.Join(directory, "assets", "notes.txt")); err != nil {
		t.Fatal("unknown file removed", err)
	}
	if err := os.WriteFile(filepath.Join(directory, "assets", image.Path()), []byte("corrupt"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Read(image.Path(), image.SHA256, len(image.Data)); !errors.Is(err, ErrCorrupt) {
		t.Fatal("hash/size corruption not detected", err)
	}
	if _, err := store.Put(image); !errors.Is(err, ErrCorrupt) {
		t.Fatal("corrupt existing file silently overwritten", err)
	}
	if err := store.Remove(image.Path()); err != nil {
		t.Fatal(err)
	}
	if err := store.Remove(image.Path()); err != nil {
		t.Fatal("repeated cleanup not idempotent", err)
	}
}

func TestStoreRejectsEscapingSymlinks(t *testing.T) {
	directory := t.TempDir()
	outside := t.TempDir()
	store, err := Open(directory)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	image, err := Validate(pngBytes(t, 1, 1))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(directory, "assets", image.SHA256[:2])); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Put(image); err == nil {
		t.Fatal("write followed an escaping prefix symlink")
	}
	entries, err := os.ReadDir(outside)
	if err != nil || len(entries) != 0 {
		t.Fatal("escaped asset root", err)
	}
	second := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(second, "assets")); err != nil {
		t.Fatal(err)
	}
	if escaped, err := Open(second); err == nil {
		escaped.Close()
		t.Fatal("opened escaping asset directory symlink")
	}
}

func FuzzImageValidation(f *testing.F) {
	f.Add([]byte(safeSVG))
	f.Add([]byte(`<svg onload="alert(1)"/>`))
	f.Add([]byte("not an image"))
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > MaxBytes+1 {
			return
		}
		value, err := Validate(data)
		if err == nil {
			second, err := Validate(value.Data)
			if err != nil || value.SHA256 != second.SHA256 {
				t.Fatal("validated image not stable", err)
			}
		}
	})
}
