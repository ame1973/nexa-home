package assets

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/jpeg"
	"image/png"
)

// ValidateUpload converts JPEG uploads to canonical PNG before storing them.
// Stored assets and portable backups retain their existing format restrictions.
func ValidateUpload(data []byte) (Image, error) {
	if len(data) > MaxBytes {
		return Image{}, ErrTooLarge
	}
	if !bytes.HasPrefix(data, []byte("\xff\xd8\xff")) {
		return Validate(data)
	}
	configuration, err := jpeg.DecodeConfig(bytes.NewReader(data))
	if err != nil || !dimensions(configuration.Width, configuration.Height) {
		return Image{}, ErrInvalid
	}
	picture, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil || picture.Bounds().Dx() != configuration.Width || picture.Bounds().Dy() != configuration.Height {
		return Image{}, ErrInvalid
	}
	picture = orientJPEG(picture, jpegOrientation(data))
	var normalized bytes.Buffer
	if err := png.Encode(&normalized, picture); err != nil {
		return Image{}, ErrInvalid
	}
	return Validate(normalized.Bytes())
}

// jpegOrientation reads only the bounded EXIF IFD0 orientation and ignores other metadata.
func jpegOrientation(data []byte) int {
	for offset := 2; offset+4 <= len(data); {
		if data[offset] != 0xff {
			break
		}
		for offset < len(data) && data[offset] == 0xff {
			offset++
		}
		if offset >= len(data) {
			break
		}
		marker := data[offset]
		offset++
		if marker == 0xda || marker == 0xd9 {
			break
		}
		if marker == 0x01 || marker >= 0xd0 && marker <= 0xd8 {
			continue
		}
		if offset+2 > len(data) {
			break
		}
		length := int(binary.BigEndian.Uint16(data[offset:]))
		if length < 2 || length > len(data)-offset {
			break
		}
		if marker == 0xe1 {
			if orientation := exifOrientation(data[offset+2 : offset+length]); orientation != 0 {
				return orientation
			}
		}
		offset += length
	}
	return 1
}

func exifOrientation(data []byte) int {
	if len(data) < 14 || !bytes.Equal(data[:6], []byte("Exif\x00\x00")) {
		return 0
	}
	tiff := data[6:]
	var order binary.ByteOrder
	switch string(tiff[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 0
	}
	if order.Uint16(tiff[2:]) != 42 {
		return 0
	}
	offset := uint64(order.Uint32(tiff[4:]))
	if offset+2 > uint64(len(tiff)) {
		return 0
	}
	ifd := tiff[int(offset):]
	count := int(order.Uint16(ifd))
	if count > (len(ifd)-2)/12 {
		return 0
	}
	for i := 0; i < count; i++ {
		entry := ifd[2+i*12 : 2+(i+1)*12]
		if order.Uint16(entry) == 0x0112 && order.Uint16(entry[2:]) == 3 && order.Uint32(entry[4:]) == 1 {
			orientation := int(order.Uint16(entry[8:]))
			if orientation >= 1 && orientation <= 8 {
				return orientation
			}
		}
	}
	return 0
}

func orientJPEG(source image.Image, orientation int) image.Image {
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	outWidth, outHeight := width, height
	if orientation >= 5 {
		outWidth, outHeight = height, width
	}
	result := image.NewNRGBA(image.Rect(0, 0, outWidth, outHeight))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			var outX, outY int
			switch orientation {
			default:
				outX, outY = x, y
			case 2:
				outX, outY = width-1-x, y
			case 3:
				outX, outY = width-1-x, height-1-y
			case 4:
				outX, outY = x, height-1-y
			case 5:
				outX, outY = y, x
			case 6:
				outX, outY = height-1-y, x
			case 7:
				outX, outY = height-1-y, width-1-x
			case 8:
				outX, outY = y, width-1-x
			}
			result.Set(outX, outY, source.At(bounds.Min.X+x, bounds.Min.Y+y))
		}
	}
	return result
}
