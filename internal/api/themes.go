package api

import (
	"encoding/json"
	"math"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"nexa-home/internal/security"
)

const (
	MaxThemeBytes = 16 << 10
	MaxCSSBytes   = 64 << 10
)

// CustomTheme is a portable token definition, not executable code or CSS.
// Raw CSS is a separate, explicitly advanced setting with its own byte limit.
type CustomTheme struct {
	SchemaVersion int           `json:"schemaVersion"`
	Name          string        `json:"name"`
	Variants      ThemeVariants `json:"variants"`
	Radius        int           `json:"radius"`
	Shadow        string        `json:"shadow"`
}
type ThemeVariants struct {
	Light ThemePalette `json:"light"`
	Dark  ThemePalette `json:"dark"`
}
type ThemePalette struct {
	Background string `json:"background"`
	Surface    string `json:"surface"`
	Accent     string `json:"accent"`
}

func validateAppearance(value *SettingsFields) error {
	if value.ThemePreset == "" {
		value.ThemePreset = "future-glass"
	}
	if !slices.Contains([]string{"future-glass", "graphite", "tide", "forest", "dune", "custom"}, value.ThemePreset) {
		return invalid("themePreset", "Choose a built-in preset or custom theme")
	}
	if value.ThemePreset == "custom" && value.CustomTheme == nil {
		return invalid("customTheme", "A custom theme definition is required")
	}
	if value.CustomTheme != nil {
		theme := value.CustomTheme
		theme.Name = strings.TrimSpace(theme.Name)
		if theme.SchemaVersion != 1 || !security.Text(theme.Name, 1, 80) || !slices.Contains([]int{8, 12, 16, 20}, theme.Radius) || !slices.Contains([]string{"none", "soft"}, theme.Shadow) {
			return invalid("customTheme", "Use theme schema 1, a name of 1 to 80 characters, a supported radius and shadow")
		}
		for _, variant := range []ThemePalette{theme.Variants.Light, theme.Variants.Dark} {
			if !security.Color(variant.Background) || !security.Color(variant.Surface) || !security.Color(variant.Accent) {
				return invalid("customTheme", "Use six-digit hex colors for both variants")
			}
			// Both surfaces share one text color. Mixed black/white surfaces cannot
			// meet AA; reject them rather than silently shipping unreadable controls.
			black := math.Min(themeContrast(variant.Background, "#000000"), themeContrast(variant.Surface, "#000000"))
			white := math.Min(themeContrast(variant.Background, "#ffffff"), themeContrast(variant.Surface, "#ffffff"))
			if math.Max(black, white) < 4.5 {
				return invalid("customTheme", "Background and surface must share a readable text color (4.5:1)")
			}
		}
		encoded, err := json.Marshal(theme)
		if err != nil || len(encoded) > MaxThemeBytes {
			return invalid("customTheme", "A theme definition must be at most 16 KiB")
		}
	}
	if !utf8.ValidString(value.CustomCSS) || len(value.CustomCSS) > MaxCSSBytes || strings.ContainsRune(value.CustomCSS, '\x00') {
		return invalid("customCSS", "Use valid UTF-8 CSS without NUL, at most 64 KiB")
	}
	return nil
}

func themeLuminance(color string) float64 {
	var result float64
	for i, weight := range []float64{0.2126, 0.7152, 0.0722} {
		value, _ := strconv.ParseUint(color[1+i*2:3+i*2], 16, 8)
		channel := float64(value) / 255
		if channel <= 0.04045 {
			channel /= 12.92
		} else {
			channel = math.Pow((channel+0.055)/1.055, 2.4)
		}
		result += channel * weight
	}
	return result
}

func themeContrast(first, second string) float64 {
	a, b := themeLuminance(first), themeLuminance(second)
	return (math.Max(a, b) + 0.05) / (math.Min(a, b) + 0.05)
}
