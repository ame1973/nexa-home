-- Nexa Home 1.0.0 - SQLite migration 001. Apply once inside BEGIN IMMEDIATE.
PRAGMA foreign_keys = ON;
CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE admin_account (
 id INTEGER PRIMARY KEY CHECK(id=1), username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, password_updated_at TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE app_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), site_title TEXT NOT NULL DEFAULT 'Nexa Home',
 site_subtitle TEXT NOT NULL DEFAULT 'Your personal space',
 access_mode TEXT NOT NULL DEFAULT 'public' CHECK(access_mode IN ('public','private')),
 theme TEXT NOT NULL DEFAULT 'dark' CHECK(theme IN ('dark','light','system')),
 accent TEXT NOT NULL DEFAULT '#8B9FFF',
 card_density TEXT NOT NULL DEFAULT 'comfortable' CHECK(card_density IN ('compact','comfortable')),
 glass_enabled INTEGER NOT NULL DEFAULT 1 CHECK(glass_enabled IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 updated_at TEXT NOT NULL
);
CREATE TABLE categories (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 icon TEXT NOT NULL DEFAULT 'layout-grid', position INTEGER NOT NULL DEFAULT 0,
 is_visible INTEGER NOT NULL DEFAULT 1 CHECK(is_visible IN (0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_categories_name ON categories(name COLLATE NOCASE);
CREATE INDEX idx_categories_order ON categories(position,id);
CREATE TABLE icon_assets (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('png','webp','svg')),
 mime_type TEXT NOT NULL, sha256 TEXT NOT NULL UNIQUE, relative_path TEXT NOT NULL UNIQUE,
 byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 1048576),
 width INTEGER, height INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE services (
 id TEXT PRIMARY KEY,
 category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
 name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 icon_kind TEXT NOT NULL CHECK(icon_kind IN ('lucide','asset','favicon')),
 icon_value TEXT NOT NULL DEFAULT 'app-window',
 icon_asset_id TEXT REFERENCES icon_assets(id) ON DELETE RESTRICT,
 color TEXT NOT NULL DEFAULT '#405B82',
 open_mode TEXT NOT NULL DEFAULT 'new_tab' CHECK(open_mode IN ('new_tab','same_tab')),
 is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0,1)),
 is_visible INTEGER NOT NULL DEFAULT 1 CHECK(is_visible IN (0,1)),
 position INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK ((icon_kind='asset' AND icon_asset_id IS NOT NULL) OR (icon_kind!='asset' AND icon_asset_id IS NULL))
);
CREATE INDEX idx_services_order ON services(category_id,position,id);
CREATE INDEX idx_services_visible ON services(is_visible,is_favorite);
CREATE TABLE service_links (
 id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
 label TEXT NOT NULL CHECK(label IN ('primary','lan','wan')),
 url TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
 UNIQUE(service_id,label)
);
CREATE INDEX idx_service_links_service ON service_links(service_id,position,id);
CREATE TABLE tags (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
 created_at TEXT NOT NULL
);
CREATE TABLE service_tags (
 service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
 tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
 PRIMARY KEY(service_id,tag_id)
);
CREATE TABLE admin_sessions (
 id_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
 expires_at TEXT NOT NULL, csrf_secret_hash TEXT NOT NULL,
 user_agent_hash TEXT, revoked_at TEXT
);
CREATE INDEX idx_sessions_expiry ON admin_sessions(expires_at);
CREATE TABLE auth_rate_limits (
 key_hash TEXT PRIMARY KEY, failure_count INTEGER NOT NULL DEFAULT 0,
 window_started_at TEXT NOT NULL, locked_until TEXT
);
CREATE TABLE audit_log (
 id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, action TEXT NOT NULL,
 target_type TEXT, target_id TEXT, detail_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_audit_occurred ON audit_log(occurred_at DESC);
INSERT INTO app_settings(id,updated_at) VALUES (1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT INTO schema_migrations(version,applied_at) VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
