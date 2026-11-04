# Changelog

Notable user-visible changes are recorded here. Versions follow Semantic Versioning. An unreleased section is not a published artifact, a release tag or a claim that every release gate is clear.

## 1.0.0 — Unreleased

### Added

- Single-administrator setup protected by an expiring local startup token, password login, session expiry/logout, CSRF protection and all-session password revocation.
- Public/private launchers with services, favorites, visible categories/tags, local search and safe primary HTTP(S) links.
- Traditional Chinese/English UI, dark/light/system themes, optional glass effects, reduced-motion support, keyboard controls and responsive management navigation.
- Service/category/tag management, hidden-inclusive keyboard/drag ordering and revision-aware settings that retain conflicting drafts.
- Local Lucide icons and bounded validated PNG/WebP/inert SVG uploads, with private/reference-aware delivery and safe deletion.
- Full portable JSON export, validated restore preview, explicit replacement and bounded single-use import tokens; destination authentication/audit state is preserved.
- One CGO-free Linux Go executable with embedded frontend, SQLite, structured UTC logs, healthcheck, graceful shutdown, private single-writer storage and offline doctor.
- Pinned nonroot scratch Docker images for Linux amd64/arm64, hardened Compose deployment, HTTPS proxy example and complete backup/upgrade/recovery documentation.
- Dependency license notices retained with binary/container distributions; verification is reproducible from locked dependencies.

### Limits and compatibility

- Initial database schema version 1 and portable backup format version 1. No default account, demo data, remote favicon fetch or stored-service probing is installed.
- The complete portable configuration, including exact base64 expansion, is capped at 16 MiB; overflow is atomic `409 LIMIT_EXCEEDED`.
- LAN/WAN alternatives are stored, but the launcher opens the primary link. Automatic network selection, health polling, PWA/offline behavior, multiple users and Docker/NAS control are not included.
- See [release notes](docs/release-notes-1.0.0.md) for operating requirements and [SECURITY.md](SECURITY.md) for the unused OpenPGP module advisory that still blocks the strict unfiltered Trivy gate. No scanner suppression is installed.
