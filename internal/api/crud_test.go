package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"nexa-home/internal/db"

	"github.com/google/uuid"
)

func (h *harness) category(name string, visible bool) Category {
	h.t.Helper()
	return readResponse[Category](h.t, h.request("POST", "/api/v1/admin/categories", CategoryInput{Name: name, Description: "", Icon: "layout-grid", IsVisible: visible}, 201))
}
func (h *harness) tag(name string) Tag {
	h.t.Helper()
	return readResponse[Tag](h.t, h.request("POST", "/api/v1/admin/tags", map[string]string{"name": name}, 201))
}
func serviceInput(name string) ServiceInput {
	return ServiceInput{ServiceFields: ServiceFields{Name: name, Description: "Personal service", IconKind: "lucide", IconValue: "app-window", Color: "#405B82", OpenMode: "new_tab", IsVisible: true, TagIDs: []string{}}, Links: []LinkInput{{Label: "primary", URL: "https://service.example.test"}}}
}
func inputFromService(value Service) ServiceInput {
	input := ServiceInput{ServiceFields: value.ServiceFields, Links: make([]LinkInput, len(value.Links))}
	for i, link := range value.Links {
		input.Links[i] = link.LinkInput
	}
	return input
}
func (h *harness) service(input ServiceInput) Service {
	h.t.Helper()
	return readResponse[Service](h.t, h.request("POST", "/api/v1/admin/services", input, 201))
}
func (h *harness) settings() Settings {
	h.t.Helper()
	return readResponse[Settings](h.t, h.request("GET", "/api/v1/admin/settings", nil, 200))
}

func TestProtectedBootstrapAndVisibility(t *testing.T) {
	h := newHarness(t)
	h.request("GET", "/api/v1/public/bootstrap", nil, 403)
	h.initialize()
	h.login()
	visible := h.category("Visible category", true)
	hidden := h.category("Hidden category secret", false)
	h.category("Empty category", true)
	publicTag := h.tag("Public label")
	secretTag := h.tag("Secret label")
	input := serviceInput("Visible service")
	input.CategoryID = &visible.ID
	input.TagIDs = []string{publicTag.ID}
	input.IsFavorite = true
	shown := h.service(input)
	input = serviceInput("Hidden child secret")
	input.CategoryID = &hidden.ID
	input.TagIDs = []string{secretTag.ID}
	input.Links[0].URL = "http://192.168.1.99/secret"
	h.service(input)
	input = serviceInput("Invisible service secret")
	input.IsVisible = false
	input.TagIDs = []string{secretTag.ID}
	h.service(input)
	h.service(serviceInput("Uncategorized visible"))
	cookie, csrf := h.cookie, h.csrf
	h.cookie = nil
	h.csrf = ""
	w := h.request("GET", "/api/v1/public/bootstrap", nil, 200)
	bootstrap := readResponse[Bootstrap](t, w)
	if len(bootstrap.Services) != 2 || len(bootstrap.Categories) != 1 || len(bootstrap.Tags) != 1 || bootstrap.Tags[0].ID != publicTag.ID {
		t.Fatalf("incorrect public filtration: %+v", bootstrap)
	}
	if strings.Contains(w.Body.String(), "secret") || strings.Contains(w.Body.String(), "192.168.1.99") || strings.Contains(w.Body.String(), "Empty category") {
		t.Fatal("hidden metadata leaked")
	}
	h.request("GET", "/api/v1/admin/services", nil, 401)
	h.cookie = cookie
	h.csrf = csrf
	settings := h.settings()
	settings.AccessMode = "private"
	h.request("PUT", "/api/v1/admin/settings", SettingsInput{SettingsFields: settings.SettingsFields, ExpectedRevision: settings.Revision}, 200)
	h.cookie = nil
	h.csrf = ""
	w = h.request("GET", "/api/v1/public/bootstrap", nil, 401)
	if strings.Contains(w.Body.String(), shown.Name) || strings.Contains(w.Body.String(), "siteTitle") {
		t.Fatal("private bootstrap leaked")
	}
	h.cookie = cookie
	h.csrf = csrf
	bootstrap = readResponse[Bootstrap](t, h.request("GET", "/api/v1/public/bootstrap", nil, 200))
	if len(bootstrap.Services) != 2 {
		t.Fatal("authenticated homepage exposed hidden entries")
	}
}

func TestServiceCRUDReferencesAndCascade(t *testing.T) {
	h := adminHarness(t)
	category := h.category("Media", true)
	tag := h.tag("Family")
	input := serviceInput("Synology Photos")
	input.CategoryID = &category.ID
	input.TagIDs = []string{tag.ID}
	input.Links = append(input.Links, LinkInput{Label: "lan", URL: "http://192.168.1.10:5000"}, LinkInput{Label: "wan", URL: "https://例子.台灣/photos"})
	created := h.service(input)
	if !validID(created.ID) || len(created.Links) != 3 || created.Position != 0 || created.CreatedAt == "" {
		t.Fatal(created)
	}
	for _, link := range created.Links {
		if !validID(link.ID) {
			t.Fatal("missing generated link ID")
		}
	}
	if !strings.Contains(created.Links[2].URL, "xn--") {
		t.Fatal("IDNA URL was not canonicalized")
	}
	updatedInput := inputFromService(created)
	updatedInput.Name = "Updated photos"
	updatedInput.Description = "相片保存"
	updatedInput.IsFavorite = true
	updated := readResponse[Service](t, h.request("PUT", "/api/v1/admin/services/"+created.ID, updatedInput, 200))
	if updated.CreatedAt != created.CreatedAt || updated.Links[0].ID == created.Links[0].ID || updated.Name != updatedInput.Name {
		t.Fatal("replacement semantics broken")
	}
	before := h.request("GET", "/api/v1/admin/services/"+created.ID, nil, 200).Body.String()
	missingTag := uuid.NewString()
	updatedInput.TagIDs = []string{tag.ID, missingTag}
	updatedInput.Name = "Must not persist"
	h.request("PUT", "/api/v1/admin/services/"+created.ID, updatedInput, 409)
	after := h.request("GET", "/api/v1/admin/services/"+created.ID, nil, 200).Body.String()
	if before != after {
		t.Fatal("failed replacement partially persisted")
	}
	missingCategory := uuid.NewString()
	updatedInput.TagIDs = []string{}
	updatedInput.CategoryID = &missingCategory
	h.request("POST", "/api/v1/admin/services", updatedInput, 409)
	h.request("DELETE", "/api/v1/admin/categories/"+category.ID, nil, 204)
	uncategorized := readResponse[Service](t, h.request("GET", "/api/v1/admin/services/"+created.ID, nil, 200))
	if uncategorized.CategoryID != nil || len(uncategorized.Links) != 3 {
		t.Fatal("category deletion did not preserve child service")
	}
	h.request("DELETE", "/api/v1/admin/tags/"+tag.ID, nil, 204)
	untagged := readResponse[Service](t, h.request("GET", "/api/v1/admin/services/"+created.ID, nil, 200))
	if len(untagged.TagIDs) != 0 {
		t.Fatal("tag associations not removed")
	}
	h.request("DELETE", "/api/v1/admin/services/"+created.ID, nil, 204)
	h.request("GET", "/api/v1/admin/services/"+created.ID, nil, 404)
	for _, table := range []string{"services", "service_links", "service_tags"} {
		var count int
		if err := h.database.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&count); err != nil || count != 0 {
			t.Fatalf("cascade %s: %d %v", table, count, err)
		}
	}
	if err := db.Check(context.Background(), h.database); err != nil {
		t.Fatal(err)
	}
}

func TestServiceValidationRollback(t *testing.T) {
	h := adminHarness(t)
	for _, test := range []struct {
		name   string
		change func(*ServiceInput)
	}{
		{"duplicate primary", func(v *ServiceInput) { v.Links = append(v.Links, v.Links[0]) }},
		{"missing primary", func(v *ServiceInput) { v.Links[0].Label = "lan" }},
		{"unknown label", func(v *ServiceInput) { v.Links[0].Label = "other" }},
		{"javascript", func(v *ServiceInput) { v.Links[0].URL = "javascript:alert(1)" }},
		{"credentials", func(v *ServiceInput) { v.Links[0].URL = "https://user:pass@example.com" }},
		{"encoded CRLF", func(v *ServiceInput) { v.Links[0].URL = "https://example.com/%0d%0a" }},
		{"blank name", func(v *ServiceInput) { v.Name = "   " }},
		{"long Unicode name", func(v *ServiceInput) { v.Name = strings.Repeat("家", 81) }},
		{"invalid color", func(v *ServiceInput) { v.Color = "url(evil)" }},
		{"unknown icon", func(v *ServiceInput) { v.IconValue = "arbitrary-icon" }},
		{"uncached favicon", func(v *ServiceInput) { v.IconKind = "favicon" }},
		{"asset missing", func(v *ServiceInput) { v.IconKind = "asset" }},
		{"duplicate tags", func(v *ServiceInput) { id := uuid.NewString(); v.TagIDs = []string{id, id} }},
		{"null tags", func(v *ServiceInput) { v.TagIDs = nil }},
		{"invalid mode", func(v *ServiceInput) { v.OpenMode = "popup" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			input := serviceInput("Candidate")
			test.change(&input)
			h.request("POST", "/api/v1/admin/services", input, 400)
		})
	}
	input := serviceInput(strings.Repeat("家", 80))
	h.service(input)
	page := readResponse[ServicePage](t, h.request("GET", "/api/v1/admin/services", nil, 200))
	if page.Total != 1 {
		t.Fatalf("invalid requests wrote %d services", page.Total)
	}
	responsePayload := page.Items[0]
	h.request("POST", "/api/v1/admin/services", responsePayload, 400)
	var raw map[string]any
	encoded, _ := json.Marshal(input)
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatal(err)
	}
	raw["links"].([]any)[0].(map[string]any)["id"] = uuid.NewString()
	h.request("POST", "/api/v1/admin/services", raw, 400)
}

func TestCatalogUniquenessAndReorder(t *testing.T) {
	h := adminHarness(t)
	first := h.category("Media", true)
	second := h.category("Storage", false)
	h.request("POST", "/api/v1/admin/categories", CategoryInput{Name: "media", Icon: "layout-grid", IsVisible: true}, 409)
	h.request("PUT", "/api/v1/admin/categories/"+second.ID, CategoryInput{Name: "MEDIA", Icon: "layout-grid", IsVisible: true}, 409)
	renamed := readResponse[Category](t, h.request("PUT", "/api/v1/admin/categories/"+second.ID, CategoryInput{Name: "Archive", Icon: "archive", IsVisible: true}, 200))
	if renamed.CreatedAt != second.CreatedAt || renamed.Position != second.Position {
		t.Fatal("category identity changed")
	}
	h.request("PUT", "/api/v1/admin/categories/reorder", map[string]any{"ids": []string{first.ID}}, 409)
	h.request("PUT", "/api/v1/admin/categories/reorder", map[string]any{"ids": []string{first.ID, first.ID}}, 400)
	h.request("PUT", "/api/v1/admin/categories/reorder", map[string]any{"ids": []string{second.ID, first.ID}}, 204)
	categories := readResponse[[]Category](t, h.request("GET", "/api/v1/admin/categories", nil, 200))
	if categories[0].ID != second.ID || categories[0].Position != 0 || categories[1].Position != 1 {
		t.Fatal("noncontiguous category ordering")
	}
	tag := h.tag("Family")
	other := h.tag("Private")
	h.request("POST", "/api/v1/admin/tags", map[string]string{"name": "family"}, 409)
	h.request("PUT", "/api/v1/admin/tags/"+other.ID, map[string]string{"name": "FAMILY"}, 409)
	renamedTag := readResponse[Tag](t, h.request("PUT", "/api/v1/admin/tags/"+tag.ID, map[string]string{"name": "Home"}, 200))
	if renamedTag.CreatedAt != tag.CreatedAt {
		t.Fatal("tag identity changed")
	}
	h.request("PUT", "/api/v1/admin/tags/"+uuid.NewString(), map[string]string{"name": "Missing"}, 404)
	h.request("DELETE", "/api/v1/admin/categories/"+uuid.NewString(), nil, 404)
	h.request("GET", "/api/v1/admin/services/not-a-uuid", nil, 400)
}

func TestScopedServiceReorderAndMovement(t *testing.T) {
	h := adminHarness(t)
	category := h.category("Media", true)
	input := serviceInput("First")
	input.CategoryID = &category.ID
	first := h.service(input)
	input.Name = "Hidden second"
	input.IsVisible = false
	second := h.service(input)
	other := h.service(serviceInput("Uncategorized"))
	reorder := func(categoryID *string, ids []string, status int) {
		h.request("PUT", "/api/v1/admin/services/reorder", map[string]any{"categoryId": categoryID, "ids": ids}, status)
	}
	reorder(&category.ID, []string{first.ID}, 409)
	reorder(&category.ID, []string{first.ID, other.ID}, 409)
	reorder(&category.ID, []string{first.ID, first.ID}, 400)
	reorder(&category.ID, []string{second.ID, first.ID}, 204)
	first = readResponse[Service](t, h.request("GET", "/api/v1/admin/services/"+first.ID, nil, 200))
	second = readResponse[Service](t, h.request("GET", "/api/v1/admin/services/"+second.ID, nil, 200))
	if first.Position != 1 || second.Position != 0 {
		t.Fatal("hidden entries not included in exact reorder")
	}
	moved := inputFromService(first)
	moved.CategoryID = nil
	first = readResponse[Service](t, h.request("PUT", "/api/v1/admin/services/"+first.ID, moved, 200))
	if first.Position != 1 {
		t.Fatal("category edit changed position before reorder")
	}
	reorder(&category.ID, []string{second.ID}, 204)
	reorder(nil, []string{first.ID, other.ID}, 204)
	missingID := uuid.NewString()
	reorder(&missingID, []string{}, 409)
}

func TestPaginationAndUnicodeSearch(t *testing.T) {
	h := adminHarness(t)
	category := h.category("家庭資料", true)
	tag := h.tag("重要")
	for i := 0; i < 3; i++ {
		input := serviceInput(fmt.Sprintf("Service %d", i))
		input.CategoryID = &category.ID
		input.TagIDs = []string{tag.ID}
		h.service(input)
	}
	page := readResponse[ServicePage](t, h.request("GET", "/api/v1/admin/services?page=2&pageSize=2", nil, 200))
	if page.Total != 3 || len(page.Items) != 1 || page.Page != 2 || page.PageSize != 2 {
		t.Fatal(page)
	}
	page = readResponse[ServicePage](t, h.request("GET", "/api/v1/admin/services?page=9223372036854775807", nil, 200))
	if page.Items == nil || len(page.Items) != 0 || page.Total != 3 {
		t.Fatal("past-end pagination malformed")
	}
	for _, query := range []string{"q=%E9%87%8D%E8%A6%81", "q=%20SERVICE%20", "q=%E5%AE%B6%E5%BA%AD"} {
		page = readResponse[ServicePage](t, h.request("GET", "/api/v1/admin/services?"+query, nil, 200))
		if page.Total != 3 {
			t.Fatalf("search %s: %+v", query, page)
		}
	}
	page = readResponse[ServicePage](t, h.request("GET", "/api/v1/admin/services?q=%27%20OR%201%3D1--", nil, 200))
	if page.Total != 0 {
		t.Fatal("search was interpolated into SQL")
	}
	for _, query := range []string{"page=0", "page=-1", "page=hello", "pageSize=0", "pageSize=201", "page=1&page=2", "extra=true", "q=" + strings.Repeat("x", 101), "q=%GG"} {
		h.request("GET", "/api/v1/admin/services?"+query, nil, 400)
	}
}

func TestConcurrentSettingsRevision(t *testing.T) {
	h := adminHarness(t)
	settings := h.settings()
	input := SettingsInput{SettingsFields: settings.SettingsFields, ExpectedRevision: settings.Revision}
	input.SiteTitle = "New home"
	body, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	results := make(chan *httptest.ResponseRecorder, 2)
	for range 2 {
		go func() {
			r := httptest.NewRequest("PUT", origin+"/api/v1/admin/settings", bytes.NewReader(body))
			r.Header.Set("Content-Type", "application/json")
			r.Header.Set("Origin", origin)
			r.Header.Set("X-CSRF-Token", h.csrf)
			r.AddCookie(h.cookie)
			w := httptest.NewRecorder()
			h.server.ServeHTTP(w, r)
			results <- w
		}()
	}
	counts := map[int]int{}
	for range 2 {
		w := <-results
		counts[w.Code]++
		if err := h.server.contract.ValidateResponse("PUT", "/api/v1/admin/settings", w.Code, w.Body.Bytes()); err != nil {
			t.Fatal(err)
		}
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatal(counts)
	}
	updated := h.settings()
	if updated.Revision != settings.Revision+1 || updated.SiteTitle != "New home" {
		t.Fatal(updated)
	}
	input.ExpectedRevision = updated.Revision
	input.SiteTitle = "  "
	h.request("PUT", "/api/v1/admin/settings", input, 400)
	if got := h.settings(); !reflect.DeepEqual(got, updated) {
		t.Fatal("invalid settings partially persisted")
	}
}

func TestAdminRouteGuardsAndExpiry(t *testing.T) {
	h := adminHarness(t)
	cookie, csrf := h.cookie, h.csrf
	for _, op := range h.server.contract.Operations() {
		if !strings.HasPrefix(op.Path, "/api/v1/admin/") {
			continue
		}
		path := strings.ReplaceAll(op.Path, "{id}", uuid.NewString())
		r := httptest.NewRequest(op.Method, origin+path, nil)
		_, pattern := h.server.mux.Handler(r)
		if pattern == "/" {
			continue
		}
		h.cookie = nil
		h.csrf = ""
		h.request(op.Method, path, map[string]any{}, 401)
		h.cookie = cookie
		h.csrf = ""
		if op.Method != "GET" {
			h.request(op.Method, path, map[string]any{}, 403)
		}
	}
	h.cookie = cookie
	h.csrf = csrf
	if _, err := h.database.Exec("UPDATE admin_sessions SET expires_at=?", db.Timestamp(time.Now().Add(-time.Hour))); err != nil {
		t.Fatal(err)
	}
	h.request("GET", "/api/v1/auth/me", nil, 401)
	h.request("GET", "/api/v1/admin/services", nil, 401)
}

func TestFaviconAliasAndDatabaseRollback(t *testing.T) {
	h := adminHarness(t)
	asset := readResponse[Asset](t, h.upload("favicon.png", iconPNG(t, 1), 201, false))
	assetID := asset.ID
	input := serviceInput("Cached favicon")
	input.IconKind = "favicon"
	input.IconAssetID = &assetID
	input.IconValue = "Uploaded favicon"
	service := h.service(input)
	if service.IconKind != "asset" || *service.IconAssetID != assetID {
		t.Fatal("favicon not normalized for SQL CHECK")
	}
	before := h.request("GET", "/api/v1/admin/services/"+service.ID, nil, 200).Body.String()
	if _, err := h.database.Exec(`CREATE TRIGGER reject_link BEFORE INSERT ON service_links BEGIN SELECT RAISE(ABORT,'injected write failure'); END`); err != nil {
		t.Fatal(err)
	}
	input.Name = "Must roll back"
	h.request("PUT", "/api/v1/admin/services/"+service.ID, input, 409)
	after := h.request("GET", "/api/v1/admin/services/"+service.ID, nil, 200).Body.String()
	if before != after {
		t.Fatal("link insertion failure did not roll back service and associations")
	}
}
