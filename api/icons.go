package contract

import (
	_ "embed"
	"encoding/json"
	"slices"
)

//go:embed icons.json
var iconDocument []byte

var iconNames = func() []string {
	var names []string
	if err := json.Unmarshal(iconDocument, &names); err != nil {
		panic(err)
	}
	return names
}()

// IsIcon uses the same finite registry imported by the frontend icon chooser.
func IsIcon(name string) bool { return slices.Contains(iconNames, name) }
