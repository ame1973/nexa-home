# Security

**English** | [繁體中文](SECURITY.zh-Hant.md)

## Supported scope and reporting

Nexa Home 1.0.x is a single-administrator application for a trusted self-hosting operator. Keep the application, browser and reverse proxy patched. It is not an identity provider, a multi-tenant boundary, a Docker control plane or a replacement for a firewall. Do not grant it a Docker socket, host networking, privileged mode or access to unrelated NAS files.

For a suspected vulnerability, use this repository's private vulnerability reporting channel when enabled. Otherwise ask the maintainers for a private reporting channel without posting exploit details or sensitive data publicly. Include the application version, a minimal synthetic reproduction, expected behavior and impact. Never submit real setup tokens, session cookies, passwords, private service URLs, logs or backups in an issue. No private reporting address is implied if the repository has not configured one.

## Transport and the reverse proxy

- Use HTTPS for remote access. Set `NEXA_PUBLIC_ORIGIN` to the exact external origin, including a nondefault port when applicable. Publish at the origin root, not under an application subpath.
- Leave `NEXA_ALLOW_HTTP_COOKIE=false`. An explicit `true` is only for isolated loopback or a trusted HTTP LAN; the application warns on startup. Secure cookies cannot make a public HTTP connection safe.
- Trust only actual proxy peer IPs or narrowly defined networks. `0.0.0.0/0` and `::/0` are rejected. On a Docker bridge, a host proxy may appear as the bridge gateway, not `127.0.0.1`. Leave trust empty if the peer is not known; forwarded client addresses will then be ignored.
- Origin checks never infer trust from forwarded host/protocol headers. Incoming `Origin` or same-origin `Referer` must match. There is no permissive CORS mode. Forwarding uses only the trusted suffix of the client-IP chain.
- Do not add a shared proxy cache for HTML, APIs, private icons or backups. Preserve application security and no-store headers. See [deployment](docs/deployment.md) and the [NGINX example](deploy/nginx.conf.example).

## Administrator and sessions

First run generates a random 256-bit setup token. Only its hash remains in process memory; it expires after 30 minutes. The plaintext appears only in local startup output, even at the `error` log level. Treat startup output as a secret. The token is never returned by an HTTP endpoint. Restart an uninitialized instance to issue a new token. Initialization is atomic and never installs a default username or password.

Passwords are hashed with Argon2id using 19 MiB, two iterations, parallelism one, a random 16-byte salt and a 32-byte output. Choose a unique 12–128-character password and store it in a password manager. Password changes require the current password and revoke every session, including the current one.

Session cookies are opaque 256-bit values with HttpOnly, SameSite=Lax and secure-by-default flags. Only digests are persisted. Sessions expire after 12 hours of inactivity or seven days absolutely. Authenticated mutations also require the synchronized CSRF token. CSRF and import tokens remain in browser memory; only locale, theme and appearance preferences enter localStorage.

Persistent login/setup rate limits survive restarts. Five failed attempts lock a bucket for 15 minutes. The limiter has a bounded 4096-bucket capacity and fails closed when saturated. Do not run multiple writers or disable the data lock to evade a lockout.

## Visibility is not encryption

Public mode intentionally publishes visible services in visible categories and only their necessary categories/tags. A hidden category hides its children from the public launcher, even for an administrator viewing that launcher. Deleting the category moves its services to Uncategorized: individually visible services can become public. Review the confirmation before deleting a hidden category.

Private mode requires a session before configuration or private icons are returned. Uploaded icons that are unreferenced or referenced only by hidden services cannot be retrieved anonymously. Browser storage does not retain private names or URLs after authentication loss; protected requests are cancelled before cached state is cleared.

The database and backups are not encrypted by the application. Host root, the Docker administrator, the data-directory owner, disk snapshots and backup operators are trusted. Use disk/backup encryption and host access controls. A copied infrastructure backup contains password/session digests and audit history; it must be treated as sensitive even though plaintext passwords are not stored.

## Content and network boundaries

The server never fetches saved service links, remote favicons, uploaded URL references or service health information. Private LAN URLs are allowed because the launcher is for NAS services, but only validated HTTP(S) links are stored. Credentials in URLs, unsafe schemes, encoded controls and ambiguous hosts are rejected. New-tab links use `noopener noreferrer`; names/descriptions are rendered as text.

Icons are uploaded files, not remote downloads. PNG is decoded/re-encoded, WebP is fully decoded and validated, and SVG is rebuilt from a strict inert allowlist. Raster dimensions are at most 512 × 512; each file is at most 1 MiB. SVG scripts, events, entities, external references, animation and arbitrary styles are rejected. Asset paths are content-addressed and confined by `os.Root`, with no-overwrite publication and rollback cleanup.

JSON rejects unknown/duplicate keys, invalid UTF-8 and excessive nesting. Ordinary JSON bodies are limited to 128 KiB; portable backups to 16 MiB. The entire restorable configuration, including exact base64 expansion, must remain within that 16 MiB budget. Entity and icon writes enforce it inside their transaction. Counts are bounded to 5000 services/categories/tags each and 1024 icons. A restore validates its graph and files before a separately confirmed, session-bound, five-minute, single-use commit. Credentials, sessions, rate limits and audit history are never replaced by a portable restore.

The script CSP is self-only: no inline scripts, eval, remote fonts or third-party analytics. Style elements use the response's nonce where needed; Sonner's stylesheet is external. Style attributes remain permitted for UI positioning and validated colors, not arbitrary script execution. Frames, objects and a foreign base URI are disallowed.

## Storage and runtime

Use a dedicated nonroot OS user and private local storage: directories `0700`, database/lock files `0600`. The process checks ownership, rejects symlink data paths and multiply linked lock files, and acquires an exclusive Linux file lock before SQLite open, migration or asset collection. Never remove a live lock inode. SQLite WAL and its assets belong to one process and one local filesystem; live NFS/SMB/synchronization and multiple replicas are unsupported.

The supplied container runs as UID/GID `10001:10001` with a read-only root filesystem, a small noexec tmpfs, dropped capabilities and no-new-privileges. Its scratch runtime contains no shell, Node, compiler or package manager. Node and Go builder images are pinned by version and digest. Go symbol information is retained for accurate executable vulnerability analysis; filesystem build paths are trimmed.

Logs contain structured route templates, status, request ID and timing rather than request bodies, cookie headers or query strings. The first-run setup-token message is the deliberate local exception. Restrict Docker/NAS log access, rotate logs and do not upload unredacted startup logs. There is no remote telemetry.

## Release workflow trust

Merges/pushes to `master` and explicit version tags can publish executable code and container images. Protect the release branch and tag creation/updates; review workflow, release-script and lockfile changes. Configure the `release` environment's reviewers and branch/tag restrictions explicitly; the YAML environment name alone does not require approval. Release-branch maintainers, tag issuers, workflow maintainers and package administrators remain trusted operators.

Planning and branch/PR verification are read-only. Only the gated publishing job receives short-lived release/package write permission, with registry authentication confined to a private runner-temporary Docker configuration. It downloads only the current run's plan and declared architecture artifacts, verifies the source/notes-bound plan digest and file hashes before login, and creates automatic tags only after verification. Public tag receipts contain bounded commit-derived release metadata/notes, not credentials or application data. The job loads tested OCI archives without rebuilding and verifies immutable runtime descriptors before publishing its same-plan draft. Runtime logs are never release artifacts. Failed publication may leave a tag, partial registry state or an unpublished draft because GitHub Releases and GHCR do not share an atomic transaction. See [release operation and recovery](docs/releases.md).

## Dependency checks and the OpenPGP advisory

Run the following on a frontend-built source tree:

```sh
npm audit --include=dev
go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 -show verbose ./...
go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 \
  -mode=binary -show verbose bin/nexa-home
npm run scan:image
```

The image scanner uses a saved local image archive, never a Docker-socket mount or image publication. Its JSON reports stay under ignored `.local/security/reports/`. It scans all severities, displays reviewed suppressions and returns nonzero for every unhandled finding; a failed scan is not a clean release gate.

The locked `golang.org/x/crypto v0.58.0` includes metadata for [GO-2026-5932](https://pkg.go.dev/vuln/GO-2026-5932), concerning the unmaintained OpenPGP packages. Nexa Home imports Argon2id and BLAKE2b, not OpenPGP. Source and symbol-preserving binary analysis distinguish an unused module advisory from affected imported packages or reachable symbols. CI also rejects an OpenPGP runtime dependency.

**Reviewed conditional exception:** [.trivyignore.yaml](.trivyignore.yaml) covers only `GO-2026-5932`, binary path `nexa-home`, and exact package PURL `pkg:golang/golang.org/x/crypto@v0.58.0`, expiring **2027-02-01**. It is valid only while neither the application nor any transitive runtime dependency imports OpenPGP. Both Linux architecture dependency closures and actual symbol-preserving executables are checked; CI rejects any direct/transitive OpenPGP import. Source and binary vulnerability scans have no such suppression.

The scanner's `--show-suppressed` output retains the advisory, reason and source in JSON rather than pretending the module finding disappeared. All unhandled findings remain fatal. A different path, package version, advisory or an expired policy does not match; policy tests pin the single rule and expiry. Reassess on an upstream stable fix, dependency change or before expiry. Never replace it with a severity-wide omission, blanket ignore-unfixed policy, removed build metadata or incompatible forced dependency override.

See [backup and recovery](docs/backup-and-recovery.md) before an upgrade, host migration or credential recovery.
