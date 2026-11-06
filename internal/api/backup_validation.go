package api

import (
	"encoding/base64"
	"fmt"
	"strings"

	"nexa-home/internal/assets"
	"nexa-home/internal/security"

	"golang.org/x/text/cases"
)

func nameKey(name string) string { return cases.Fold().String(name) }

func validateImport(value *Backup) (map[string]assets.Image, error) {
	if value.Format != "nexa-home-backup" || (value.Version != 1 && value.Version != 2) {
		return nil, invalid("version", "Unsupported backup format or version")
	}
	if len(value.Services) > MaxServices || len(value.Categories) > MaxCatalogEntries || len(value.Tags) > MaxCatalogEntries || len(value.Assets) > MaxAssets {
		return nil, invalid("body", "Backup exceeds a catalog or icon count limit")
	}
	if err := validateSettings(&value.Settings.SettingsFields); err != nil {
		return nil, err
	}
	value.Version = 2
	ids := make(map[string]bool)
	register := func(id, field string) error {
		if !validID(id) || ids[id] {
			return invalid(field, "Use globally unique canonical UUIDv4 IDs")
		}
		ids[id] = true
		return nil
	}
	categories := make(map[string]bool, len(value.Categories))
	categoryNames := make(map[string]bool)
	for i := range value.Categories {
		category := &value.Categories[i]
		if err := register(category.ID, fmt.Sprintf("categories.%d.id", i)); err != nil {
			return nil, err
		}
		if err := validateCategory(&category.CategoryInput); err != nil {
			return nil, err
		}
		key := nameKey(category.Name)
		if categoryNames[key] {
			return nil, invalid("categories", "Category names must be unique")
		}
		if category.Position < 0 || category.Position > MaxPosition {
			return nil, invalid("categories", "Position is outside the supported range")
		}
		categories[category.ID] = true
		categoryNames[key] = true
	}
	tags := make(map[string]bool, len(value.Tags))
	tagNames := make(map[string]bool)
	for i := range value.Tags {
		tag := &value.Tags[i]
		tag.Name = strings.TrimSpace(tag.Name)
		if err := register(tag.ID, fmt.Sprintf("tags.%d.id", i)); err != nil {
			return nil, err
		}
		key := nameKey(tag.Name)
		if !security.Text(tag.Name, 1, 32) || tagNames[key] {
			return nil, invalid("tags", "Use unique names of 1 to 32 characters")
		}
		tags[tag.ID] = true
		tagNames[key] = true
	}
	images := make(map[string]assets.Image, len(value.Assets))
	hashes := make(map[string]bool)
	totalBytes := 0
	for i := range value.Assets {
		icon := &value.Assets[i]
		if err := register(icon.ID, fmt.Sprintf("assets.%d.id", i)); err != nil {
			return nil, err
		}
		if len(icon.Base64) > base64.StdEncoding.EncodedLen(assets.MaxBytes) {
			return nil, invalid("assets", "Each icon must be at most 1 MiB")
		}
		decoded, err := base64.StdEncoding.Strict().DecodeString(icon.Base64)
		if err != nil || base64.StdEncoding.EncodeToString(decoded) != icon.Base64 {
			return nil, invalid("assets", "Use canonical base64 icon content")
		}
		image, err := assets.Validate(decoded)
		if err != nil || image.MIME != icon.MIME {
			return nil, invalid("assets", "Invalid icon bytes, dimensions, MIME type or SVG content")
		}
		if hashes[image.SHA256] {
			return nil, invalid("assets", "Identical icon content must share one asset ID")
		}
		totalBytes += len(image.Data)
		if totalBytes > MaxBackupBytes {
			return nil, invalid("assets", "Decoded icon content exceeds the restore budget")
		}
		images[icon.ID] = image
		hashes[image.SHA256] = true
		icon.Base64 = ""
	}
	for i := range value.Services {
		service := &value.Services[i]
		if err := register(service.ID, fmt.Sprintf("services.%d.id", i)); err != nil {
			return nil, err
		}
		input := ServiceInput{ServiceFields: service.ServiceFields, Links: make([]LinkInput, len(service.Links))}
		for j, link := range service.Links {
			if err := register(link.ID, fmt.Sprintf("services.%d.links.%d.id", i, j)); err != nil {
				return nil, err
			}
			input.Links[j] = link.LinkInput
		}
		if err := validateService(&input); err != nil {
			return nil, err
		}
		if input.CategoryID != nil && !categories[*input.CategoryID] {
			return nil, invalid("services", "Referenced category is missing")
		}
		if input.IconAssetID != nil {
			if _, ok := images[*input.IconAssetID]; !ok {
				return nil, invalid("assets", "Referenced icon content is missing; export with icons included")
			}
		}
		for _, id := range input.TagIDs {
			if !tags[id] {
				return nil, invalid("services", "Referenced tag is missing")
			}
		}
		if service.Position < 0 || service.Position > MaxPosition {
			return nil, invalid("services", "Position is outside the supported range")
		}
		service.ServiceFields = input.ServiceFields
		for j := range service.Links {
			service.Links[j].LinkInput = input.Links[j]
		}
	}
	return images, nil
}
