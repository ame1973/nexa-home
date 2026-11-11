package api

import "encoding/json"

// Shared fields keep mutation and response models aligned. Contract tests remain
// authoritative; response-only IDs, positions, and timestamps are never inputs.
type SettingsFields struct {
	SiteTitle    string       `json:"siteTitle"`
	SiteSubtitle string       `json:"siteSubtitle"`
	AccessMode   string       `json:"accessMode"`
	Theme        string       `json:"theme"`
	Accent       string       `json:"accent"`
	CardDensity  string       `json:"cardDensity"`
	GlassEnabled bool         `json:"glassEnabled"`
	ThemePreset  string       `json:"themePreset"`
	CustomTheme  *CustomTheme `json:"customTheme"`
	CustomCSS    string       `json:"customCSS"`
}
type Settings struct {
	SettingsFields
	Revision  int64  `json:"revision"`
	UpdatedAt string `json:"updatedAt"`
}
type SettingsInput struct {
	SettingsFields
	ExpectedRevision int64 `json:"expectedRevision"`
}

type CategoryInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
	IsVisible   bool   `json:"isVisible"`
}
type Category struct {
	CategoryInput
	ID        string `json:"id"`
	Position  int    `json:"position"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}
type Tag struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

type HealthCheck struct {
	URL             string `json:"url"`
	IntervalSeconds int    `json:"intervalSeconds"`
}

type ServiceFields struct {
	Name        string       `json:"name"`
	Description string       `json:"description"`
	CategoryID  *string      `json:"categoryId"`
	IconKind    string       `json:"iconKind"`
	IconValue   string       `json:"iconValue"`
	IconAssetID *string      `json:"iconAssetId"`
	Color       string       `json:"color"`
	OpenMode    string       `json:"openMode"`
	IsFavorite  bool         `json:"isFavorite"`
	IsVisible   bool         `json:"isVisible"`
	TagIDs      []string     `json:"tagIds"`
	HealthCheck *HealthCheck `json:"healthCheck,omitempty"`
}
type LinkInput struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}
type Link struct {
	LinkInput
	ID string `json:"id"`
}
type ServiceInput struct {
	ServiceFields
	Links               []LinkInput `json:"links"`
	healthCheckProvided bool
}

// UnmarshalJSON distinguishes explicit null (disable) from an older client omitting the field.
func (value *ServiceInput) UnmarshalJSON(data []byte) error {
	type plain ServiceInput
	var presence struct {
		HealthCheck json.RawMessage `json:"healthCheck"`
	}
	if err := json.Unmarshal(data, &presence); err != nil {
		return err
	}
	if err := json.Unmarshal(data, (*plain)(value)); err != nil {
		return err
	}
	value.healthCheckProvided = presence.HealthCheck != nil
	return nil
}

type Service struct {
	ServiceFields
	ID        string `json:"id"`
	Position  int    `json:"position"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
	Links     []Link `json:"links"`
}
type ServicePage struct {
	Items    []Service `json:"items"`
	Total    int       `json:"total"`
	Page     int       `json:"page"`
	PageSize int       `json:"pageSize"`
}
type Bootstrap struct {
	Settings   Settings   `json:"settings"`
	Categories []Category `json:"categories"`
	Services   []Service  `json:"services"`
	Tags       []Tag      `json:"tags"`
}
