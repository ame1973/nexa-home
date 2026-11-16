-- Keep launcher layout independent of the chosen color palette.
ALTER TABLE app_settings ADD COLUMN layout_preset TEXT NOT NULL DEFAULT 'future-glass'
    CHECK(layout_preset IN ('future-glass','graphite','tide','forest','dune'));
UPDATE app_settings SET layout_preset = CASE theme_preset
    WHEN 'graphite' THEN 'graphite'
    WHEN 'tide' THEN 'tide'
    WHEN 'forest' THEN 'forest'
    WHEN 'dune' THEN 'dune'
    ELSE 'future-glass'
END;

-- The shared wallpaper is one bounded raster image, stored atomically with settings.
CREATE TABLE site_background (
    id INTEGER PRIMARY KEY CHECK(id=1),
    mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
    sha256 TEXT NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
    byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 4194304),
    width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 4096),
    height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 4096 AND width*height <= 8847360),
    content BLOB NOT NULL CHECK(typeof(content)='blob' AND length(content)=byte_size)
);
INSERT INTO schema_migrations(version,applied_at) VALUES(4,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
