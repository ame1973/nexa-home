# Nexa Home

**English** | [繁體中文](readme.zh-Hant.md)

A self-hosted launcher for the services you use every day. Nexa Home pairs a restrained Future Glass interface with a single Go process, a local SQLite database, and locally stored icons.

- One administrator, protected first-run setup, and public or private homepage access.
- Services, favorites, categories, tags, keyboard ordering, and desktop drag-and-drop ordering.
- Search entirely in the browser; service URLs are never probed by the server.
- Dark, light, and system themes; optional glass effects; twelve interface languages including Traditional/Simplified Chinese and Arabic RTL.
- Built-in Lucide icons and validated PNG, WebP, or inert SVG uploads. Cached favicons are uploaded, never fetched remotely.
- Portable JSON export and a validated, explicitly confirmed replacement restore.

LAN and WAN links can be saved alongside the required primary URL. The launcher opens the primary URL; automatic network switching, health polling, PWA/offline mode, multiple users, and NAS/Docker control are not included.

## Docker deployment

From a trusted source checkout, copy `deploy/.env.example` to ignored `deploy/.env` and configure the exact public origin. For isolated loopback testing, use `NEXA_PUBLIC_ORIGIN=http://127.0.0.1:8080` and explicitly set `NEXA_ALLOW_HTTP_COOKIE=true`. For remote access, configure a trusted HTTPS reverse proxy and leave that flag `false`.

```sh
cp deploy/.env.example deploy/.env
# Edit deploy/.env for your own HTTPS domain or the isolated HTTP values above.
docker compose --env-file deploy/.env -f deploy/compose.yaml up --detach --build --wait
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T nexa-home /nexa-home healthcheck
```

The default binding is **127.0.0.1:8080**, not every NAS interface. The named volume persists `/data`; keep the same project name across ordinary upgrades. The image runs as UID/GID `10001:10001` with a read-only root, dropped capabilities, no-new-privileges and no shell or Node. Node/Go are build stages only. Linux amd64 and arm64 use the same Dockerfile, with pinned builder versions/digests.

Read the one-time token locally with `docker compose --env-file deploy/.env -f deploy/compose.yaml logs nexa-home`, then open `/setup` at the configured origin. **Do not publish startup logs or tokens.** A remote browser cannot reach the NAS's loopback address; configure the proxy or an explicitly isolated LAN binding before using another device.

- [Deployment, HTTPS proxy, storage and troubleshooting](docs/deployment.md)
- [Backup, upgrade, rollback and credential recovery](docs/backup-and-recovery.md)
- [Security boundaries and reviewed dependency policy](SECURITY.md)
- [Automatic versions, release notes and GHCR publishing](docs/releases.md)
- [Changelog](CHANGELOG.md) and [1.0.0 release notes](docs/release-notes-1.0.0.md)

No registry publication or hosted CI run is implied by these local build instructions. Raw image scans retain an unused OpenPGP module advisory. Its reviewed path/version-specific exception expires on 2027-02-01 and is valid only while no direct or transitive runtime dependency uses OpenPGP; see the security notice. Other findings remain fatal.

## Build from source

Build on Linux with Node.js 24.14.1 or newer in the Node 24 line, npm, and the Go toolchain declared in `go.mod` (Go 1.27.3). Node is a build/test dependency only; the resulting executable embeds the frontend and does not need Node at runtime.

```sh
npm ci --ignore-scripts
npm run build
./bin/nexa-home version
```

`npm run build:web` writes the compiled frontend into `internal/web/dist/`. Build it before running Go commands that compile the executable or embedded web package. Do not edit generated bundles. Browser bundles use `/static/`; `/assets/{id}` belongs to the protected icon API.

`npm run build` resolves an explicit `NEXA_BUILD_VERSION`, an exact checkout version tag, or the coherent development package baseline, in that order. Release CI stamps only its temporary checkout and does not commit version bumps; see [automatic version policy](docs/releases.md#version-files-and-source-builds).

To cross-compile the Linux arm64 executable after building the frontend:

```sh
VERSION=$(node scripts/release.mjs version) &&
  GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -trimpath \
    -ldflags "-X main.version=$VERSION" \
    -o bin/nexa-home-linux-arm64 ./cmd/nexa-home
```

## Run locally

For an isolated loopback installation:

```sh
NEXA_LISTEN=127.0.0.1:8080 \
NEXA_DATA_DIR="$PWD/data" \
NEXA_PUBLIC_ORIGIN=http://127.0.0.1:8080 \
NEXA_ALLOW_HTTP_COOKIE=true \
./bin/nexa-home
```

Open `http://127.0.0.1:8080/setup`. The startup log contains a one-time setup token, valid for 30 minutes. Paste it into the masked setup field, choose a username, and create a unique 12–128-character password. Setup never creates a default account or password. After initialization, sign in to manage services.

**HTTP session cookies are an explicit exception for an isolated trusted LAN or loopback testing. Do not expose this configuration to the Internet.** For remote access, use HTTPS at a reverse proxy, set the exact public origin, and leave `NEXA_ALLOW_HTTP_COOKIE=false`. Nexa Home itself listens over HTTP behind that proxy.

The setup token is printed only to local startup output, including when the configured log level is `error`. Treat startup logs as sensitive. It is never returned by an HTTP endpoint. Restarting an uninitialized instance issues a new token; initialized instances do not issue setup tokens.

Stop the process with SIGTERM or Ctrl+C. It drains HTTP work, closes pending imports and storage, then releases exclusive ownership of its data directory.

## Configuration

| Variable                   | Default        | Meaning                                                                                 |
| -------------------------- | -------------- | --------------------------------------------------------------------------------------- |
| `NEXA_LISTEN`              | `0.0.0.0:8080` | HTTP listen address, including a port from 1 to 65535                                   |
| `NEXA_DATA_DIR`            | `/data`        | Absolute path to private, persistent local storage                                      |
| `NEXA_PUBLIC_ORIGIN`       | unset          | Exact browser origin, such as `https://home.example.com`; required with trusted proxies |
| `NEXA_TRUSTED_PROXY_CIDRS` | empty          | Comma-separated proxy peer networks; trust only your actual reverse proxy               |
| `NEXA_ALLOW_HTTP_COOKIE`   | `false`        | Permit insecure cookies only for explicitly isolated HTTP use                           |
| `NEXA_LOG_LEVEL`           | `info`         | `debug`, `info`, `warn`, or `error`                                                     |
| `TZ`                       | host setting   | Does not change log timestamps; logs are always UTC                                     |

Use the public origin without an application path or query. Proxy deployments must publish the application at the origin root. Forwarded host/protocol headers do not change the application's trusted origin. Client IP forwarding is honored only through the configured trusted proxy suffix; trusting every address is rejected. There is no permissive CORS configuration.

## Data ownership

The process user must own the data directory. Use private permissions: `0700` for directories and `0600` for database/lock files. Existing group/other-accessible paths, symlinks for application data paths, and multiply linked lock files are rejected rather than silently changing permissions.

The directory contains:

- `nexa.db`, plus SQLite WAL/shared-memory files while in use.
- `assets/`, containing validated content-addressed icon files.
- `.nexa.lock`, the exclusive process-ownership lock.

Only one application or offline maintenance command may own a data directory. Do not delete the lock file to bypass an ownership error; the process lock is automatically released on exit. Use a local filesystem, not a live synchronized SQLite file or a shared multi-writer NAS mount.

Changing a service's category preserves the service and updates both complete ordering scopes, including hidden services. Deleting a category keeps its services and moves them to Uncategorized; individually visible services can therefore become public. Referenced icons cannot be deleted.

## Use the launcher

1. Open Manage and add a service with a name and primary HTTP(S) URL.
2. Choose a built-in icon or upload a local icon. Uploaded raster dimensions must not exceed 512 × 512; each upload is limited to 1 MiB.
3. Optionally assign a category and up to 20 tags, mark a favorite, or hide a service/category.
4. Use the homepage search to find names, descriptions, categories, or tags. `/` and Ctrl/Cmd+K focus search; Escape clears it.
5. In Manage, choose manual order with no text/tag/visibility filter to reorder. Explicit up/down controls support keyboard and mobile use. Editing a service also supports moving it to an empty category.

Public mode exposes only visible services in visible categories, plus the categories/tags actually needed by those services. Private mode requires authentication before service data or private icons are returned. Password changes revoke every session, including the current session. Settings use revision checks: a conflicting draft stays intact until you explicitly reload it.

## Interface languages

Use the globe button in the header to switch immediately. Each option uses its native name:

| Language | Locale |
| -------- | ------ |
| 繁體中文 | `zh-Hant` |
| 简体中文 | `zh-Hans` |
| English | `en` |
| 日本語 | `ja` |
| 한국어 | `ko` |
| Español | `es` |
| Français | `fr` |
| Deutsch | `de` |
| Português (Brasil) | `pt-BR` |
| Русский | `ru` |
| العربية | `ar` |
| हिन्दी | `hi` |

A saved browser preference takes priority. Otherwise the first supported browser language is selected; unmatched preferences fall back to Traditional Chinese. Explicit Chinese scripts take precedence over region: `zh-Hant` stays Traditional and `zh-Hans` stays Simplified. Taiwan, Hong Kong and Macao default to Traditional Chinese; generic Chinese, mainland China, Singapore and Malaysia default to Simplified Chinese. Portuguese preferences use the Brazilian Portuguese translation.

Arabic switches layout and keyboard direction to right-to-left, including navigation, dialogs, menus and controls. URLs and hexadecimal colors remain left-to-right; user-entered names and descriptions are not translated. Switching back restores left-to-right layout. Language and theme preferences remain local to the browser, are not shared site settings and do not enter portable backups. Product manuals remain available in English and Traditional Chinese.

The interface uses system fonts on the **browser's device** and does not download web fonts. Minimal Linux clients need fonts covering the scripts they display, including CJK, Arabic and Devanagari. Missing glyphs or square boxes require a suitable client-side system font, not a change to the server or scratch container.

## Backup and restore

Use **Manage → Backup → Export backup**. Leave **Include icon files** enabled for a fully restorable copy. Backups contain private names and URLs; protect them and keep a separate copy outside the application data directory. Credentials, sessions, rate-limit state, and audit history are not exported.

To restore:

1. Select a UTF-8 Nexa Home JSON backup, at most 16 MiB.
2. Validate it and review the entity counts and settings-change warning.
3. Explicitly acknowledge replacement, then choose Replace configuration.

Restore replaces services, categories, tags, appearance, and icons, but preserves the current administrator, sessions, and audit history. A preview belongs to the current session, expires after five minutes, and is single-use even when a commit attempt fails. Validate again before retrying. Validation rejects unknown/duplicate JSON fields, invalid references or IDs, unsafe content, unsupported versions, and oversized graphs before replacement.

All accepted configuration must fit a **16 MiB full export, including exact base64 icon expansion**. Writes that would exceed this portable budget fail atomically with `409 LIMIT_EXCEEDED`. Other bounds are 5000 services, categories, and tags each; 1024 icons; and nonnegative signed-32-bit positions. An export without icons is not restorable if it still references those missing icons.

Do not copy a live SQLite/WAL database as a backup. Prefer the portable export, or stop the process before an infrastructure-level copy that preserves the complete data directory.

## Health and maintenance

```sh
NEXA_LISTEN=127.0.0.1:8080 ./bin/nexa-home healthcheck
```

`/healthz` reports process liveness; `/readyz` checks database readiness. Neither returns setup tokens or configuration data. The healthcheck command uses the configured listen address, does not follow redirects or environment proxies, and exits nonzero when not ready.

Stop the server before checking a data directory:

```sh
NEXA_DATA_DIR="$PWD/data" ./bin/nexa-home doctor
```

Doctor checks the known schema, SQLite integrity, foreign keys, stored icon hashes/metadata, and image validity. It does not create an administrator, initialize a nonexistent database, or collect orphan files.

## Development and verification

```sh
npm run check:generated
npm run lint:api
npm run test:contract
npm run typecheck
npm run lint:web
npm run test:build
npm run test:release
npm run test:security-policy
npm run test:docs
npm run test:web
npm run build
npm run notices -- --check

go test -race -cover -count=1 ./...
go vet ./...

# A matching Playwright Chromium installation is required.
npm exec -- playwright install chromium
npm run test:e2e
```

Browser tests launch the actual built Go executable with a fresh private directory per test. They exercise real setup/login, CRUD, complete reorder scopes, backup/restore, CSP, session revocation, responsive targets, real axe contrast checks, and a 1000-service input-to-paint measurement. Traces, video, and automatic failure screenshots are disabled so credentials do not enter artifacts. Explicit screenshots use synthetic data and blank credential fields.

The local container-test, image-scan and release-export helpers require a Docker CLI and daemon supporting platform-aware image operations: `image inspect --platform` needs API **1.49+**, and `image save --platform` needs API **1.48+**. CI installs Docker **29.5.3** and Buildx **0.38.2** through SHA-pinned Docker-maintained Actions rather than relying on the runner's preinstalled versions. This is a development/release tooling requirement, not an additional requirement for running a prebuilt image.

After building the Docker image, `npm run test:container` exercises real Compose deployment, fresh-volume cold recovery and verified HTTPS with Secure cookies and exact-origin checks. It requires Docker/Compose, tar and OpenSSL, creates only its own isolated resources, and never installs a host CA or privileged emulator. `npm run scan:image` scans a saved image with pinned Trivy without exposing the daemon socket. Unhandled findings return nonzero and remain visible; reviewed suppressions retain their reasons and source in reports, which stay local/ignored. The Verify workflow runs native amd64/arm64 checks without registry credentials. The Release workflow automatically plans versions and release notes from Conventional Commits on `master`, retaining explicit tag compatibility. Only after both architecture jobs succeed does it create the automatic tag, publish the exact verified images to GHCR and provide versioned executables/checksums. Preview dispatches never publish, and planning failures still run source verification; see [release setup and operation](docs/releases.md). Neither workflow deploys the application to a remote server.

The HTTP contract is in [api/openapi.yaml](api/openapi.yaml); generated JSON and TypeScript remain checked for drift. Do not modify generated artifacts by hand.

Use `npm run dev:web` for the Vite development server. Its `/api` and `/assets` proxy points to `127.0.0.1:8080`; for this isolated development configuration set the Go process's public origin to the Vite origin and explicitly allow HTTP cookies. Production serving does not use Vite or its development server.

## License

Nexa Home is licensed under the [MIT License](LICENSE). Third-party dependencies retain their respective licenses. Preserve [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) with redistributed binaries/images; the runtime image includes both files under `/usr/share/licenses/nexa-home/`. `npm run notices -- --check` verifies the locked dependency inventory and retained texts.
