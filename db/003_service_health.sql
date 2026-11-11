-- Health checks are opt-in and belong to their service.
CREATE TABLE service_health_checks (
    service_id TEXT PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
    url TEXT NOT NULL CHECK(length(CAST(url AS BLOB)) BETWEEN 8 AND 2048),
    interval_seconds INTEGER NOT NULL CHECK(typeof(interval_seconds) = 'integer' AND interval_seconds BETWEEN 30 AND 86400)
);
INSERT INTO schema_migrations(version,applied_at) VALUES(3,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
