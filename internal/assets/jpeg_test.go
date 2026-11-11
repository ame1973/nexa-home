package assets

import (
	"bytes"
	"encoding/binary"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"math/rand"
	"testing"
)

func jpegBytes(t testing.TB, width, height int) []byte {
	t.Helper()
	picture := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			picture.SetRGBA(x, y, color.RGBA{R: uint8(x * 31), G: uint8(y * 47), B: uint8((x + y) * 23), A: 255})
		}
	}
	var output bytes.Buffer
	if err := jpeg.Encode(&output, picture, nil); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

func withEXIFOrientation(data []byte, order binary.ByteOrder, orientation uint16) []byte {
	exif := make([]byte, 6+8+2+12+4)
	copy(exif, "Exif\x00\x00")
	if order == binary.LittleEndian {
		copy(exif[6:], "II")
	} else {
		copy(exif[6:], "MM")
	}
	order.PutUint16(exif[8:], 42)
	order.PutUint32(exif[10:], 8)
	order.PutUint16(exif[14:], 1)
	order.PutUint16(exif[16:], 0x0112)
	order.PutUint16(exif[18:], 3)
	order.PutUint32(exif[20:], 1)
	order.PutUint16(exif[24:], orientation)
	length := len(exif) + 2
	result := append([]byte{}, data[:2]...)
	result = append(result, 0xff, 0xe1, byte(length>>8), byte(length))
	result = append(result, exif...)
	return append(result, data[2:]...)
}

func TestJPEGUploadNormalizesOrientationAndMetadata(t *testing.T) {
	original := jpegBytes(t, 3, 2)
	decoded, err := jpeg.Decode(bytes.NewReader(original))
	if err != nil {
		t.Fatal(err)
	}
	orientations := [][]string{
		{"ABC", "DEF"},
		{"CBA", "FED"},
		{"FED", "CBA"},
		{"DEF", "ABC"},
		{"AD", "BE", "CF"},
		{"DA", "EB", "FC"},
		{"FC", "EB", "DA"},
		{"CF", "BE", "AD"},
	}
	for _, order := range []binary.ByteOrder{binary.LittleEndian, binary.BigEndian} {
		for index, rows := range orientations {
			jpegData := withEXIFOrientation(original, order, uint16(index+1))
			jpegData = append(jpegData, []byte("untrusted trailing content")...)
			got, err := ValidateUpload(jpegData)
			if err != nil || got.MIME != "image/png" || got.Kind != "png" || got.Width != len(rows[0]) || got.Height != len(rows) {
				t.Fatalf("orientation %d, %T: %#v, %v", index+1, order, got, err)
			}
			if bytes.Contains(got.Data, []byte("Exif")) || bytes.Contains(got.Data, []byte("untrusted trailing content")) {
				t.Fatal("JPEG metadata or trailing content survived normalization")
			}
			picture, err := png.Decode(bytes.NewReader(got.Data))
			if err != nil {
				t.Fatal(err)
			}
			for y, row := range rows {
				for x, letter := range row {
					source := int(letter - 'A')
					want := color.NRGBAModel.Convert(decoded.At(source%3, source/3))
					if pixel := color.NRGBAModel.Convert(picture.At(x, y)); pixel != want {
						t.Fatalf("orientation %d, %T, pixel %d,%d: got %v, want %v", index+1, order, x, y, pixel, want)
					}
				}
			}
			validated, err := Validate(got.Data)
			if err != nil || validated.SHA256 != got.SHA256 {
				t.Fatal("normalized JPEG is not a stable stored PNG", err)
			}
		}
	}
}

func TestJPEGOrientationIgnoresMalformedMetadata(t *testing.T) {
	jpeg := jpegBytes(t, 3, 2)
	valid := withEXIFOrientation(jpeg, binary.LittleEndian, 6)
	badOffset := bytes.Clone(valid)
	binary.LittleEndian.PutUint32(badOffset[16:20], ^uint32(0))
	badCount := bytes.Clone(valid)
	binary.LittleEndian.PutUint16(badCount[20:22], ^uint16(0))
	badType := bytes.Clone(valid)
	binary.LittleEndian.PutUint16(badType[24:26], 4)
	beforeExif := append([]byte{}, valid[:2]...)
	beforeExif = append(beforeExif, 0xff, 0xe1, 0, 3, 'X')
	beforeExif = append(beforeExif, valid[2:]...)
	for _, test := range []struct {
		name string
		data []byte
		want int
	}{
		{"no EXIF", jpeg, 1},
		{"invalid orientation", withEXIFOrientation(jpeg, binary.BigEndian, 9), 1},
		{"out-of-bounds IFD", badOffset, 1},
		{"out-of-bounds entry count", badCount, 1},
		{"wrong entry type", badType, 1},
		{"another APP1 before EXIF", beforeExif, 6},
		{"truncated marker", []byte{0xff, 0xd8, 0xff, 0xe1, 0xff}, 1},
		{"stop at image scan", append([]byte{0xff, 0xd8, 0xff, 0xda}, valid[2:]...), 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := jpegOrientation(test.data); got != test.want {
				t.Fatalf("got orientation %d, want %d", got, test.want)
			}
		})
	}
	got, err := ValidateUpload(badOffset)
	if err != nil || got.Width != 3 || got.Height != 2 || bytes.Contains(got.Data, []byte("Exif")) {
		t.Fatal("malformed EXIF was not safely ignored and removed", err)
	}
}

func TestJPEGUploadLimitsAndInvalidData(t *testing.T) {
	valid := jpegBytes(t, 10, 7)
	if _, err := Validate(valid); !errors.Is(err, ErrInvalid) {
		t.Fatal("JPEG must not be accepted as an already-stored PNG", err)
	}
	for _, data := range [][]byte{
		nil,
		[]byte("\xff\xd8\xffjpeg"),
		valid[:len(valid)-2],
		jpegBytes(t, 513, 1),
		jpegBytes(t, 1, 513),
	} {
		if _, err := ValidateUpload(data); !errors.Is(err, ErrInvalid) {
			t.Fatalf("accepted invalid JPEG (%d bytes): %v", len(data), err)
		}
	}
	if _, err := ValidateUpload(append(valid, make([]byte, MaxBytes)...)); !errors.Is(err, ErrTooLarge) {
		t.Fatal("oversized JPEG was not rejected", err)
	}

	picture := image.NewRGBA(image.Rect(0, 0, MaxDimension, MaxDimension))
	random := rand.New(rand.NewSource(1))
	for i := 0; i < len(picture.Pix); i += 4 {
		picture.Pix[i], picture.Pix[i+1], picture.Pix[i+2], picture.Pix[i+3] = uint8(random.Intn(256)), uint8(random.Intn(256)), uint8(random.Intn(256)), 255
	}
	var large bytes.Buffer
	if err := jpeg.Encode(&large, picture, nil); err != nil {
		t.Fatal(err)
	}
	for _, orientation := range []uint16{1, 6} {
		got, err := ValidateUpload(withEXIFOrientation(large.Bytes(), binary.LittleEndian, orientation))
		if err != nil || got.Width != MaxDimension || got.Height != MaxDimension || len(got.Data) > MaxBytes {
			t.Fatalf("maximum-size JPEG orientation %d: %dx%d, %d bytes, %v", orientation, got.Width, got.Height, len(got.Data), err)
		}
	}
}
