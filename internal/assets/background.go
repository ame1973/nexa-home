package assets

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"image"
	"image/jpeg"
	"image/png"

	"golang.org/x/image/webp"
)

const (
	MaxBackgroundBytes     = 4 << 20
	MaxBackgroundDimension = 4096
	MaxBackgroundPixels    = 4096 * 2160
)

var (
	ErrInvalidBackground  = errors.New("invalid or unsupported background image")
	ErrBackgroundTooLarge = errors.New("background image exceeds the size limit")
)

// Background is an inert raster image stored separately from the icon collection.
type Background struct {
	Data   []byte
	MIME   string
	SHA256 string
	Width  int
	Height int
}

func backgroundDimensions(width, height int) bool {
	return width > 0 && height > 0 && width <= MaxBackgroundDimension && height <= MaxBackgroundDimension && int64(width)*int64(height) <= MaxBackgroundPixels
}

// ValidateBackgroundUpload normalizes JPEG and PNG uploads, including JPEG orientation.
func ValidateBackgroundUpload(data []byte) (Background, error) { return background(data, true) }

// ValidateBackground checks stored or restored bytes without changing their content.
func ValidateBackground(data []byte) (Background, error) { return background(data, false) }

func background(data []byte, normalize bool) (Background, error) {
	if len(data) > MaxBackgroundBytes {
		return Background{}, ErrBackgroundTooLarge
	}
	var picture image.Image
	var config image.Config
	var err error
	var mime string
	switch {
	case bytes.HasPrefix(data, []byte("\xff\xd8\xff")):
		mime = "image/jpeg"
		config, err = jpeg.DecodeConfig(bytes.NewReader(data))
		if err == nil && backgroundDimensions(config.Width, config.Height) {
			picture, err = jpeg.Decode(bytes.NewReader(data))
		}
	case bytes.HasPrefix(data, []byte("\x89PNG\r\n\x1a\n")):
		mime = "image/png"
		config, err = png.DecodeConfig(bytes.NewReader(data))
		if err == nil && backgroundDimensions(config.Width, config.Height) {
			picture, err = png.Decode(bytes.NewReader(data))
		}
	case len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP":
		if uint64(binary.LittleEndian.Uint32(data[4:8]))+8 != uint64(len(data)) {
			return Background{}, ErrInvalidBackground
		}
		mime = "image/webp"
		config, err = webp.DecodeConfig(bytes.NewReader(data))
		if err == nil && backgroundDimensions(config.Width, config.Height) {
			picture, err = webp.Decode(bytes.NewReader(data))
		}
	default:
		return Background{}, ErrInvalidBackground
	}
	if err != nil || picture == nil || !backgroundDimensions(config.Width, config.Height) || picture.Bounds().Dx() != config.Width || picture.Bounds().Dy() != config.Height {
		return Background{}, ErrInvalidBackground
	}
	if normalize && mime != "image/webp" {
		var encoded bytes.Buffer
		if mime == "image/jpeg" {
			if orientation := jpegOrientation(data); orientation != 1 {
				picture = orientJPEG(picture, orientation)
			}
			err = jpeg.Encode(&encoded, picture, &jpeg.Options{Quality: 90})
		} else {
			err = png.Encode(&encoded, picture)
		}
		if err != nil {
			return Background{}, ErrInvalidBackground
		}
		data = encoded.Bytes()
	}
	if len(data) > MaxBackgroundBytes {
		return Background{}, ErrBackgroundTooLarge
	}
	hash := sha256.Sum256(data)
	return Background{Data: bytes.Clone(data), MIME: mime, SHA256: hex.EncodeToString(hash[:]), Width: picture.Bounds().Dx(), Height: picture.Bounds().Dy()}, nil
}
