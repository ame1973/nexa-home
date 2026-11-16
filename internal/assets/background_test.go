package assets

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"testing"
)

func TestBackgroundUploadsAndStoredBytes(t *testing.T) {
	png := append(pngBytes(t, 800, 450), []byte("untrusted trailing metadata")...)
	image, err := ValidateBackgroundUpload(png)
	if err != nil || image.MIME != "image/png" || image.Width != 800 || image.Height != 450 || bytes.Contains(image.Data, []byte("untrusted")) {
		t.Fatalf("PNG background was not normalized: %v", err)
	}
	stored, err := ValidateBackground(image.Data)
	if err != nil || stored.SHA256 != image.SHA256 || !bytes.Equal(stored.Data, image.Data) {
		t.Fatal("stored background bytes changed", err)
	}

	jpeg := withEXIFOrientation(jpegBytes(t, 800, 450), binary.LittleEndian, 6)
	jpeg = append(jpeg, []byte("untrusted trailing metadata")...)
	image, err = ValidateBackgroundUpload(jpeg)
	if err != nil || image.MIME != "image/jpeg" || image.Width != 450 || image.Height != 800 || bytes.Contains(image.Data, []byte("Exif")) || bytes.Contains(image.Data, []byte("untrusted")) {
		t.Fatalf("JPEG background orientation or metadata: %v", err)
	}
	stored, err = ValidateBackground(image.Data)
	if err != nil || stored.SHA256 != image.SHA256 || !bytes.Equal(stored.Data, image.Data) {
		t.Fatal("stored JPEG background bytes changed", err)
	}

	webp, err := base64.StdEncoding.DecodeString("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==")
	if err != nil {
		t.Fatal(err)
	}
	image, err = ValidateBackgroundUpload(webp)
	if err != nil || image.MIME != "image/webp" || image.Width != 1 || image.Height != 1 || !bytes.Equal(image.Data, webp) {
		t.Fatal("WebP background was not accepted", err)
	}
}

func FuzzBackgroundValidation(f *testing.F) {
	jpeg := jpegBytes(f, 3, 2)
	webp, err := base64.StdEncoding.DecodeString("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==")
	if err != nil {
		f.Fatal(err)
	}
	for _, seed := range [][]byte{nil, []byte("<svg/>"), pngBytes(f, 3, 2), jpeg, withEXIFOrientation(jpeg, binary.LittleEndian, 6), webp} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > MaxBackgroundBytes+1 {
			return
		}
		for _, validate := range []func([]byte) (Background, error){ValidateBackground, ValidateBackgroundUpload} {
			value, err := validate(data)
			if err != nil {
				continue
			}
			stored, err := ValidateBackground(value.Data)
			if err != nil || stored.SHA256 != value.SHA256 || stored.MIME != value.MIME || !backgroundDimensions(value.Width, value.Height) {
				t.Fatal("validated background not stable", err)
			}
		}
	})
}

func TestBackgroundLimitsAndInvalidInputs(t *testing.T) {
	valid := pngBytes(t, 10, 10)
	for _, data := range [][]byte{
		nil,
		[]byte("<svg xmlns='http://www.w3.org/2000/svg'/>"),
		[]byte("\xff\xd8\xffinvalid"),
		valid[:20],
		pngBytes(t, MaxBackgroundDimension+1, 1),
	} {
		if _, err := ValidateBackgroundUpload(data); !errors.Is(err, ErrInvalidBackground) {
			t.Fatalf("accepted invalid background (%d bytes): %v", len(data), err)
		}
	}
	if _, err := ValidateBackgroundUpload(make([]byte, MaxBackgroundBytes+1)); !errors.Is(err, ErrBackgroundTooLarge) {
		t.Fatal("oversized background was not rejected", err)
	}
	if !backgroundDimensions(4096, 2160) || backgroundDimensions(4096, 2161) || backgroundDimensions(0, 1) {
		t.Fatal("background pixel and dimension limits are not enforced")
	}
}
