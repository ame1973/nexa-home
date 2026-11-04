package assets

import (
	"bytes"
	"encoding/xml"
	"io"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

const svgNamespace = "http://www.w3.org/2000/svg"

var svgElements = []string{"svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "title", "desc"}
var numberPattern = regexp.MustCompile(`[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?`)
var numericAttribute = regexp.MustCompile(`^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?(?:px|%)?$`)
var numberList = regexp.MustCompile(`^[0-9eE+.,\s-]+$`)
var pathData = regexp.MustCompile(`^[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]+$`)
var transformData = regexp.MustCompile(`^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\s*\([0-9eE+.,\s-]+\)\s*)+$`)
var colorData = regexp.MustCompile(`^(?:#[0-9A-Fa-f]{3,8}|[A-Za-z]+|rgba?\([0-9.,% ]+\)|hsla?\([0-9.,% ]+\))$`)

// sanitizeSVG rebuilds a deliberately small, non-interactive SVG vocabulary.
// No style, URI-valued attribute, entity definition, foreign content, or animation
// survives. Values are validated after XML entity decoding, not with text removal.
func sanitizeSVG(data []byte) ([]byte, error) {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	var output bytes.Buffer
	encoder := xml.NewEncoder(&output)
	stack := make([]string, 0)
	seenRoot := false
	nodes := 0
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, ErrInvalid
		}
		switch token := token.(type) {
		case xml.StartElement:
			nodes++
			if nodes > 2048 || len(stack) >= 32 {
				return nil, ErrInvalid
			}
			if token.Name.Space != "" && token.Name.Space != svgNamespace {
				return nil, ErrInvalid
			}
			name := token.Name.Local
			if !slices.Contains(svgElements, name) {
				return nil, ErrInvalid
			}
			if len(stack) == 0 {
				if seenRoot || name != "svg" {
					return nil, ErrInvalid
				}
				seenRoot = true
			} else if name == "svg" {
				return nil, ErrInvalid
			}
			clean := xml.StartElement{Name: xml.Name{Local: name}}
			seenAttributes := make(map[string]bool)
			for _, attribute := range token.Attr {
				if attribute.Name.Space != "" || seenAttributes[attribute.Name.Local] {
					return nil, ErrInvalid
				}
				seenAttributes[attribute.Name.Local] = true
				if attribute.Name.Local == "xmlns" {
					if name != "svg" || attribute.Value != svgNamespace {
						return nil, ErrInvalid
					}
					continue
				}
				if !safeSVGAttribute(attribute.Name.Local, attribute.Value) {
					return nil, ErrInvalid
				}
				clean.Attr = append(clean.Attr, xml.Attr{Name: xml.Name{Local: attribute.Name.Local}, Value: attribute.Value})
			}
			if name == "svg" {
				clean.Attr = append(clean.Attr, xml.Attr{Name: xml.Name{Local: "xmlns"}, Value: svgNamespace})
			}
			if err := encoder.EncodeToken(clean); err != nil {
				return nil, ErrInvalid
			}
			stack = append(stack, name)
		case xml.EndElement:
			if len(stack) == 0 || stack[len(stack)-1] != token.Name.Local {
				return nil, ErrInvalid
			}
			if err := encoder.EncodeToken(xml.EndElement{Name: xml.Name{Local: token.Name.Local}}); err != nil {
				return nil, ErrInvalid
			}
			stack = stack[:len(stack)-1]
		case xml.CharData:
			if strings.TrimSpace(string(token)) == "" {
				continue
			}
			if len(stack) == 0 || !slices.Contains([]string{"title", "desc"}, stack[len(stack)-1]) || len(token) > 4096 {
				return nil, ErrInvalid
			}
			if err := encoder.EncodeToken(token); err != nil {
				return nil, ErrInvalid
			}
		case xml.Comment:
			// Comments and XML declarations are not retained in published files.
		case xml.ProcInst:
			if token.Target != "xml" || seenRoot {
				return nil, ErrInvalid
			}
		default:
			return nil, ErrInvalid
		}
	}
	if !seenRoot || len(stack) != 0 {
		return nil, ErrInvalid
	}
	if err := encoder.Flush(); err != nil {
		return nil, ErrInvalid
	}
	return output.Bytes(), nil
}

func safeSVGAttribute(name, value string) bool {
	if len(value) > 16384 || strings.TrimSpace(value) == "" {
		return false
	}
	switch name {
	case "fill", "stroke":
		return colorData.MatchString(value)
	case "fill-rule", "clip-rule":
		return value == "nonzero" || value == "evenodd"
	case "stroke-linecap":
		return slices.Contains([]string{"butt", "round", "square"}, value)
	case "stroke-linejoin":
		return slices.Contains([]string{"miter", "round", "bevel"}, value)
	case "preserveAspectRatio":
		parts := strings.Fields(value)
		return len(parts) >= 1 && len(parts) <= 2 && slices.Contains([]string{"none", "xMinYMin", "xMidYMin", "xMaxYMin", "xMinYMid", "xMidYMid", "xMaxYMid", "xMinYMax", "xMidYMax", "xMaxYMax"}, parts[0]) && (len(parts) == 1 || parts[1] == "meet" || parts[1] == "slice")
	case "viewBox":
		parts := strings.Fields(strings.ReplaceAll(value, ",", " "))
		if len(parts) != 4 || !boundedNumbers(value) {
			return false
		}
		for _, part := range parts {
			if _, err := strconv.ParseFloat(part, 64); err != nil {
				return false
			}
		}
		width, _ := strconv.ParseFloat(parts[2], 64)
		height, _ := strconv.ParseFloat(parts[3], 64)
		return width > 0 && height > 0
	case "d":
		return pathData.MatchString(value) && boundedNumbers(value)
	case "points", "stroke-dasharray":
		return (name == "stroke-dasharray" && value == "none") || (numberList.MatchString(value) && boundedNumbers(value))
	case "transform":
		return transformData.MatchString(value) && boundedNumbers(value)
	case "x", "y", "x1", "x2", "y1", "y2", "width", "height", "cx", "cy", "r", "rx", "ry", "opacity", "fill-opacity", "stroke-opacity", "stroke-width", "stroke-miterlimit", "stroke-dashoffset":
		return numericAttribute.MatchString(value) && boundedNumbers(value)
	default:
		return false
	}
}

func boundedNumbers(value string) bool {
	for _, number := range numberPattern.FindAllString(value, -1) {
		parsed, err := strconv.ParseFloat(number, 64)
		if err != nil || math.IsInf(parsed, 0) || math.IsNaN(parsed) || math.Abs(parsed) > 1e6 {
			return false
		}
	}
	return true
}
