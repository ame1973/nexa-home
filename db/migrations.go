// Package migrations contains the versioned, immutable SQLite schema.
package migrations

import "embed"

//go:embed *.sql
var Files embed.FS
