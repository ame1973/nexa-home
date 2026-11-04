package api

import (
	"fmt"
	"slices"
	"strings"

	contract "nexa-home/api"
	"nexa-home/internal/security"
)

const MaxServices = 5000

func validateSettings(value *SettingsFields) error {
	value.SiteTitle = strings.TrimSpace(value.SiteTitle)
	if !security.Text(value.SiteTitle, 1, 80) {
		return invalid("siteTitle", "Use 1 to 80 characters")
	}
	if !security.Text(value.SiteSubtitle, 0, 160) {
		return invalid("siteSubtitle", "Use at most 160 characters without controls")
	}
	if !slices.Contains([]string{"public", "private"}, value.AccessMode) {
		return invalid("accessMode", "Choose public or private")
	}
	if !slices.Contains([]string{"dark", "light", "system"}, value.Theme) {
		return invalid("theme", "Choose dark, light or system")
	}
	if !slices.Contains([]string{"compact", "comfortable"}, value.CardDensity) {
		return invalid("cardDensity", "Choose compact or comfortable")
	}
	if !security.Color(value.Accent) {
		return invalid("accent", "Use a six-digit hex color")
	}
	return nil
}

func validateCategory(value *CategoryInput) error {
	value.Name = strings.TrimSpace(value.Name)
	if !security.Text(value.Name, 1, 50) {
		return invalid("name", "Use 1 to 50 characters")
	}
	if !security.Text(value.Description, 0, 240) {
		return invalid("description", "Use at most 240 characters without controls")
	}
	if value.Icon == "" {
		value.Icon = "layout-grid"
	}
	if !contract.IsIcon(value.Icon) {
		return invalid("icon", "Choose an icon from the registry")
	}
	return nil
}

func validateService(value *ServiceInput) error {
	value.Name = strings.TrimSpace(value.Name)
	if !security.Text(value.Name, 1, 80) {
		return invalid("name", "Use 1 to 80 characters")
	}
	if !security.Text(value.Description, 0, 240) {
		return invalid("description", "Use at most 240 characters without controls")
	}
	if value.CategoryID != nil && !validID(*value.CategoryID) {
		return invalid("categoryId", "Expected a canonical UUIDv4")
	}
	if value.IconAssetID != nil && !validID(*value.IconAssetID) {
		return invalid("iconAssetId", "Expected a canonical UUIDv4")
	}
	if !security.Text(value.IconValue, 1, 120) {
		return invalid("iconValue", "Provide an icon name or description")
	}
	switch value.IconKind {
	case "lucide":
		if value.IconAssetID != nil || !contract.IsIcon(value.IconValue) {
			return invalid("iconValue", "Choose a registry icon without an asset ID")
		}
	case "asset", "favicon":
		if value.IconAssetID == nil {
			return invalid("iconAssetId", "An uploaded asset is required")
		}
		value.IconKind = "asset"
	default:
		return invalid("iconKind", "Choose lucide or an uploaded asset")
	}
	if !security.Color(value.Color) {
		return invalid("color", "Use a six-digit hex color")
	}
	if value.OpenMode != "new_tab" && value.OpenMode != "same_tab" {
		return invalid("openMode", "Choose new_tab or same_tab")
	}
	if len(value.TagIDs) > 20 || value.TagIDs == nil {
		return invalid("tagIds", "Provide up to 20 unique tag IDs")
	}
	tags := make(map[string]bool, len(value.TagIDs))
	for _, id := range value.TagIDs {
		if !validID(id) || tags[id] {
			return invalid("tagIds", "Provide canonical, unique UUIDv4 tag IDs")
		}
		tags[id] = true
	}
	if len(value.Links) < 1 || len(value.Links) > 3 {
		return invalid("links", "Provide one primary link and optional LAN/WAN links")
	}
	labels := make(map[string]bool, len(value.Links))
	for i, link := range value.Links {
		if !slices.Contains([]string{"primary", "lan", "wan"}, link.Label) || labels[link.Label] {
			return invalid("links", "Each link label must be unique")
		}
		labels[link.Label] = true
		normalized, err := security.URL(link.URL)
		if err != nil {
			return invalid(fmt.Sprintf("links.%d.url", i), "Use an absolute HTTP(S) URL without credentials or control characters")
		}
		value.Links[i].URL = normalized
	}
	if !labels["primary"] {
		return invalid("links", "Exactly one primary link is required")
	}
	return nil
}
