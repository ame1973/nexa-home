-- Preserve the original schema and upgrade existing installations atomically.
ALTER TABLE app_settings ADD COLUMN theme_preset TEXT NOT NULL DEFAULT 'future-glass'
    CHECK(theme_preset IN ('future-glass','graphite','tide','forest','dune','custom'));
ALTER TABLE app_settings ADD COLUMN custom_theme TEXT NOT NULL DEFAULT 'null'
    CHECK(json_valid(custom_theme) AND length(CAST(custom_theme AS BLOB)) <= 16384);
ALTER TABLE app_settings ADD COLUMN custom_css TEXT NOT NULL DEFAULT ''
    CHECK(length(CAST(custom_css AS BLOB)) <= 65536);
INSERT INTO schema_migrations(version,applied_at) VALUES(2,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
