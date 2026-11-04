// Package assets validates and stores inert, content-addressed local icons.
package assets

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"image/png"

	"golang.org/x/image/webp"
)

const MaxBytes = 1 << 20
const MaxDimension = 512

var (
	ErrInvalid  = errors.New("invalid or unsupported icon")
	ErrTooLarge = errors.New("icon exceeds the size limit")
	ErrCorrupt  = errors.New("icon content does not match its metadata")
)

type Image struct {
	Data   []byte
	MIME   string
	Kind   string
	SHA256 string
	Width  int
	Height int
}

func (image Image) Path() string { return image.SHA256[:2] + "/" + image.SHA256 + "." + image.Kind }

func Validate(data []byte) (Image, error) {
	if len(data) > MaxBytes {
		return Image{}, ErrTooLarge
	}
	if len(data) == 0 {
		return Image{}, ErrInvalid
	}
	var result Image
	switch {
	case bytes.HasPrefix(data, []byte("\x89PNG\r\n\x1a\n")):
		configuration, err := png.DecodeConfig(bytes.NewReader(data))
		if err != nil || !dimensions(configuration.Width, configuration.Height) {
			return Image{}, ErrInvalid
		}
		decoded, err := png.Decode(bytes.NewReader(data))
		if err != nil {
			return Image{}, ErrInvalid
		}
		var normalized bytes.Buffer
		if err := png.Encode(&normalized, decoded); err != nil {
			return Image{}, ErrInvalid
		}
		result = Image{Data: normalized.Bytes(), MIME: "image/png", Kind: "png", Width: configuration.Width, Height: configuration.Height}
	case len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP":
		if uint64(binary.LittleEndian.Uint32(data[4:8]))+8 != uint64(len(data)) {
			return Image{}, ErrInvalid
		}
		configuration, err := webp.DecodeConfig(bytes.NewReader(data))
		if err != nil || !dimensions(configuration.Width, configuration.Height) {
			return Image{}, ErrInvalid
		}
		decoded, err := webp.Decode(bytes.NewReader(data))
		if err != nil || decoded.Bounds().Dx() != configuration.Width || decoded.Bounds().Dy() != configuration.Height {
			return Image{}, ErrInvalid
		}
		result = Image{Data: bytes.Clone(data), MIME: "image/webp", Kind: "webp", Width: configuration.Width, Height: configuration.Height}
	default:
		normalized, err := sanitizeSVG(data)
		if err != nil {
			return Image{}, ErrInvalid
		}
		result = Image{Data: normalized, MIME: "image/svg+xml", Kind: "svg"}
	}
	if len(result.Data) > MaxBytes {
		return Image{}, ErrTooLarge
	}
	hash := sha256.Sum256(result.Data)
	result.SHA256 = hex.EncodeToString(hash[:])
	return result, nil
}

func dimensions(width, height int) bool {
	return width >= 1 && height >= 1 && width <= MaxDimension && height <= MaxDimension
}
