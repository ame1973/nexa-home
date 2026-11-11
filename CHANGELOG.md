# Changelog

**English** | [繁體中文](CHANGELOG.zh-Hant.md)

Notable user-visible changes are recorded here. Versions follow Semantic Versioning. An unreleased section is not a published artifact, a release tag or a claim that every release gate is clear. Automatically generated per-version notes are in the repository's GitHub Releases; this file remains a curated overview rather than receiving automated version-bump commits.

## Unreleased

### Added

- Opt-in service health checks with a separate trusted HTTP(S) endpoint, configurable interval and latest homepage status. Backup version 3 retains the configuration; versions 1 and 2 remain importable.
- Simplified Chinese, Japanese, Korean, Spanish, French, German, Brazilian Portuguese, Russian, Arabic and Hindi interfaces, alongside Traditional Chinese and English.
- Browser-language detection with Chinese script/region handling, persistent per-browser language selection and native language names in the menu.
- Arabic right-to-left navigation, dialogs, tables, controls and keyboard interaction, with left-to-right URLs and color codes.
- Automatic stable versions and deterministic release notes from Conventional Commits on `master`, with read-only plans, squash-PR title checks, non-publishing previews and source/notes-bound retry receipts; explicit manual tags remain supported.
- Isolated package/lockfile version stamping, injected executable/OCI versions, native amd64/arm64 verification and GHCR publication of the exact tested images, without version-bump commits to the source branch.
- GitHub Release archives with retained licenses, SHA-256 checksums and immutable image digests; prereleases/backports do not move latest backwards, and only pipeline-owned unfinished drafts can be resumed.

### Fixed

- Updated the Go toolchain and container builder to 1.27.4 to address `GO-2026-6859`.

## 1.0.0 — 2026-11-05

### Added

- Single-administrator setup protected by an expiring local startup token, password login, session expiry/logout, CSRF protection and all-session password revocation.
- Public/private launchers with services, favorites, visible categories/tags, local search and safe primary HTTP(S) links.
- Traditional Chinese/English UI, dark/light/system themes, optional glass effects, reduced-motion support, keyboard controls and responsive management navigation.
- Service/category/tag management, hidden-inclusive keyboard/drag ordering and revision-aware settings that retain conflicting drafts.
- Local Lucide icons and bounded validated PNG/WebP/inert SVG uploads, with private/reference-aware delivery and safe deletion.
- Full portable JSON export, validated restore preview, explicit replacement and bounded single-use import tokens; destination authentication/audit state is preserved.
- One CGO-free Linux Go executable with embedded frontend, SQLite, structured UTC logs, healthcheck, graceful shutdown, private single-writer storage and offline doctor.
- Pinned nonroot scratch Docker images for Linux amd64/arm64, hardened Compose deployment, HTTPS proxy example and complete Traditional Chinese/English deployment/security/backup/upgrade/recovery documentation.
- Dependency license notices retained with binary/container distributions; verification is reproducible from locked dependencies.

### Limits and compatibility

- Initial database schema version 1 and portable backup format version 1. No default account, demo data, remote favicon fetch or stored-service probing is installed.
- The complete portable configuration, including exact base64 expansion, is capped at 16 MiB; overflow is atomic `409 LIMIT_EXCEEDED`.
- LAN/WAN alternatives are stored, but the launcher opens the primary link. Automatic network selection, health polling, PWA/offline behavior, multiple users and Docker/NAS control are not included.
- See [release notes](docs/release-notes-1.0.0.md) for operating requirements and [SECURITY.md](SECURITY.md) for the reviewed, expiring unused OpenPGP module advisory exception. No direct/transitive runtime OpenPGP import is permitted, and every unhandled scanner finding remains fatal.
