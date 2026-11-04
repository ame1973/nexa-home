# Nexa Home 1.0.0 release notes

**Status: unreleased.** These notes describe the source version, not a published image/tag or successful hosted CI run. The strict Trivy image gate remains nonzero for the unused OpenPGP module advisory described below; it must not be represented as clean.

## What this version provides

Nexa Home is a single-administrator, self-hosted service launcher with a Go/SQLite runtime and embedded React frontend. It supports public/private visibility, local search, favorites, categories/tags, accessible manual ordering, locally uploaded icons, appearance settings and validated portable backup/restore. The UI is available in Traditional Chinese and English with dark, light and system themes.

Linux amd64 and arm64 are supported targets. One data directory belongs to one process. Docker is optional; the native executable needs no Node runtime. The container uses a fixed nonroot UID/GID `10001:10001`, read-only root filesystem and private persistent `/data`. Host/Docker administrators and the data owner are trusted.

## First installation

1. Follow [deployment](deployment.md), choose private local storage, and configure the exact public origin.
2. Use HTTPS for remote access. The supplied Compose binding is loopback-only by default; a deliberate isolated HTTP installation requires the explicit cookie exception.
3. Read the expiring setup token locally, initialize the administrator and sign in. Never publish startup logs or the token.
4. Add services and review visibility/private mode before sharing the launcher.
5. Export a full portable backup with icons and test recovery in separate storage.

There is no default password, imported sample catalog, background service probing, remote favicon download or telemetry. LAN/WAN links do not enable automatic switching: the launcher opens the primary URL.

## Data and compatibility

- Initial SQL schema: version 1. Future migrations are forward-only. Unknown newer schemas fail closed; do not force a downgrade.
- Portable format: `nexa-home-backup`, version 1. Full export includes configuration and icon content, not administrator credentials, sessions, rate-limit state or audit history.
- Restores replace configuration and preserve destination authentication/audit state. Review the preview because imported appearance can change public/private access. Tokens expire after five minutes and are single-use even for failed commit attempts.
- The whole restorable export is at most **16 MiB including base64**. There are also 5000-service/category/tag caps, 1024 icons, 1 MiB per icon, 512 × 512 raster dimensions and nonnegative signed-32-bit positions.
- Public views omit hidden services/category children and unused categories/tags. Deleting a category retains its services in Uncategorized, where individually visible services can become public.
- The application is not a distributed SQLite service. Live shared NAS mounts, multiple writers, Docker sockets, privileged mode and public HTTP are unsupported deployment patterns.

Before an upgrade or host migration, keep both a portable export and a complete stopped data backup with its exact compatible software version. See [backup, rollback and recovery](backup-and-recovery.md). A complete archive preserves old credentials; a new administrator plus portable import is the supported credential-loss recovery path.

## Security gate and known advisory

The locked latest stable `golang.org/x/crypto v0.58.0` carries [GO-2026-5932](https://pkg.go.dev/vuln/GO-2026-5932) for its unmaintained OpenPGP packages. Nexa Home uses Argon2id/BLAKE2b, not OpenPGP. Source and symbol-preserving binary reachability analysis are separate from module-level image findings.

The strict, all-severity Trivy scan still reports this module advisory and exits nonzero. No ignore rule, severity-wide omission or ignore-unfixed policy is installed. A stable upstream fix or an explicitly authorized reviewed policy decision is required before clearing this gate. See [SECURITY.md](../SECURITY.md). Do not describe the source version as release-complete while that decision remains outstanding.

## Redistribution

Nexa Home uses the MIT license. Preserve the root [LICENSE](../LICENSE) and [third-party notices](../THIRD_PARTY_NOTICES.md) with redistributed binaries and images. The container includes them under `/usr/share/licenses/nexa-home/`; compiler, Node, scanning and optional test emulation tools are not shipped in its runtime.
