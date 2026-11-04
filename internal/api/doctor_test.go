package api

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDoctorChecksAssetsWithoutCollectingOrInitializingAuth(t *testing.T) {
	h := newHarness(t)
	if err := CheckData(context.Background(), h.database, h.server.config.DataDir); err != nil {
		t.Fatal(err)
	}
	var admins int
	if err := h.database.QueryRow("SELECT COUNT(*) FROM admin_account").Scan(&admins); err != nil {
		t.Fatal(err)
	}
	if admins != 0 {
		t.Fatal("doctor initialized authentication")
	}
	h.initialize()
	h.login()
	h.upload("valid.png", iconPNG(t, 8), 201, false)
	stored := assetFiles(t, h)[0]
	orphan := filepath.Join(h.server.config.DataDir, "assets", "aa", strings.Repeat("a", 64)+".png")
	if err := os.MkdirAll(filepath.Dir(orphan), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(orphan, []byte("unreferenced"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := CheckData(context.Background(), h.database, h.server.config.DataDir); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(orphan); err != nil {
		t.Fatal("doctor performed destructive garbage collection", err)
	}
	if err := os.WriteFile(stored, []byte("corrupt"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := CheckData(context.Background(), h.database, h.server.config.DataDir); err == nil {
		t.Fatal("doctor accepted corrupted icon bytes")
	}
}
