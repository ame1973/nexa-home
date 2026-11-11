<!-- Logo slot: add the supplied logo above the title. -->

<div align="center">

# Nexa Home

**One home for your self-hosted services.**

A clean, personal launcher for your NAS, homelab, and everyday links.<br>
One Go process, local SQLite, and no separate database service.

**English** | [繁體中文](readme.zh-Hant.md)

[Features](#features) · [Quick start](#quick-start) · [Documentation](#documentation) · [Releases](https://github.com/ame1973/nexa-home/releases)

</div>

<!-- Preview slot: add the supplied desktop screenshot here. -->

## Features

| Make it yours              | What Nexa Home provides                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Organize your services** | Favorites, categories, tags, keyboard ordering, and desktop drag-and-drop ordering.                                 |
| **Find a link quickly**    | Search names, descriptions, categories, and tags entirely in the browser without fetching saved service links.      |
| **Monitor availability**   | Optionally check a separately configured HTTP(S) endpoint and show its latest status on the homepage.               |
| **Choose your look**       | Five light/dark presets, custom token themes, optional glass effects, and advanced CSS with safe recovery.          |
| **Use your language**      | Twelve interface languages, including Traditional/Simplified Chinese and Arabic right-to-left layouts.              |
| **Control access**         | One administrator, protected first-run setup, and a public or private homepage.                                     |
| **Pick your icons**        | Built-in Lucide icons and validated PNG, WebP, or inert SVG uploads. Favicons are uploaded, never fetched remotely. |
| **Keep a portable copy**   | JSON export with local icons, validated restore previews, and explicit confirmation before replacement.             |

<details>
<summary>Scope and limitations</summary>

LAN and WAN links can be saved alongside the required primary URL. The launcher opens the primary URL; automatic network switching, uptime history, PWA/offline mode, multiple users, and NAS/Docker control are not included.

</details>

## Quick start

You only need **Docker with Compose**. The published image supports **Linux amd64 and arm64**; no Git checkout, Node, Go, or local build is required.

### 1. Get the deployment files

Download [compose.yaml](compose.yaml) and [.env.example](.env.example) from the same reviewed repository revision into an empty directory. This standalone Compose file pulls `ghcr.io/ame1973/nexa-home:latest`.

### 2. Start Nexa Home

```sh
cp .env.example .env
docker compose up --detach --wait
docker compose exec -T nexa-home /nexa-home healthcheck
```

### 3. Create your administrator

Open **http://127.0.0.1:8080/setup** on the same host. Read the one-time token **locally** with `docker compose logs nexa-home`, paste it into the masked setup field, and create your account. There is no default username or password. The token expires after 30 minutes; never share startup logs or tokens.

> [!WARNING]
> The supplied `.env.example` enables HTTP cookies **only for isolated loopback access**. A browser on another device cannot reach the server's `127.0.0.1`. For remote access, configure an HTTPS reverse proxy, your exact `NEXA_PUBLIC_ORIGIN`, and `NEXA_ALLOW_HTTP_COOKIE=false`. Never expose the HTTP preset to the Internet. See the [deployment guide](docs/deployment.md).

**Updates and storage.** `latest` follows successful stable releases, and `up` pulls the selected image; it is not a background updater. For controlled upgrades, pin `NEXA_IMAGE` in `.env` to an existing version such as `ghcr.io/ame1973/nexa-home:1.0.1`, or an immutable index digest. The named volume persists `/data`. **Back up before upgrading, and do not use `docker compose down --volumes` for normal updates.** Read the deployment guide before switching an existing installation.

## Use the launcher

1. Open **Manage** and add a service with a name and primary HTTP(S) URL.
2. Choose a built-in icon or upload a local icon. Uploaded raster dimensions must not exceed 512 × 512; each upload is limited to 1 MiB.
3. Optionally assign a category and up to 20 tags, mark a favorite, or hide a service/category.
4. Search names, descriptions, categories, or tags from the homepage. Press `/` or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> to focus search; <kbd>Esc</kbd> clears it.
5. In Manage, choose manual order with no text/tag/visibility filter to reorder. Explicit up/down controls support keyboard and mobile use. Editing a service also supports moving it to an empty category.
6. Use the palette button for **Future Glass, Graphite, Tide, Forest or Dune**, or customize a copy. The sun/moon menu controls dark/light/system independently. Personal styles stay in your browser; **Manage → Appearance** sets shared defaults. See [themes and advanced CSS](docs/themes.md) for library/JSON/CSS workflows, feature availability, and `/?appearance=safe` recovery without bypassing sign-in.
7. To monitor a service, edit it, enable **Monitor this service**, and enter a separate trusted HTTP(S) health-check URL and interval. Checks are off by default, start immediately, and repeat 30–86400 seconds after completion (default 60). Only 2xx responses are available; redirects are not followed. The homepage shows available, unavailable or unknown, not an uptime history.

Checks originate from the server or container, not the browser; a container's loopback is not the host. Busy queues may delay checks and the homepage refreshes results approximately every 15 seconds. Only visible services in visible categories show their status publicly; hidden services can still be checked. The check URL is private but included in backups. Do not put secrets in URLs, and review [network and restore safety](SECURITY.md#content-and-network-boundaries).

Service health checks require a build or release containing this feature. The earlier `1.0.1` image does not include it; a configuration change cannot add it to an older image.

Public mode exposes only visible services in visible categories, plus the categories/tags actually needed by those services. Private mode requires authentication before service data or private icons are returned. Password changes revoke every session, including the current session. Settings use revision checks: a conflicting draft stays intact until you explicitly reload it.

<!-- Gallery slot: add the supplied mobile and management screenshots here. -->

## Interface languages

Switch immediately with the globe button in the header. Language and personal appearance preferences stay in your browser; product manuals are available in **English and Traditional Chinese**.

繁體中文 · 简体中文 · English · 日本語 · 한국어 · Español · Français · Deutsch · Português (Brasil) · Русский · العربية · हिन्दी

<details>
<summary>Locale codes, automatic detection, and right-to-left behavior</summary>

Each language option uses its native name:

| Language           | Locale    |
| ------------------ | --------- |
| 繁體中文           | `zh-Hant` |
| 简体中文           | `zh-Hans` |
| English            | `en`      |
| 日本語             | `ja`      |
| 한국어             | `ko`      |
| Español            | `es`      |
| Français           | `fr`      |
| Deutsch            | `de`      |
| Português (Brasil) | `pt-BR`   |
| Русский            | `ru`      |
| العربية            | `ar`      |
| हिन्दी             | `hi`      |

A saved browser preference takes priority. Otherwise the first supported browser language is selected; unmatched preferences fall back to Traditional Chinese. Explicit Chinese scripts take precedence over region: `zh-Hant` stays Traditional and `zh-Hans` stays Simplified. Taiwan, Hong Kong and Macao default to Traditional Chinese; generic Chinese, mainland China, Singapore and Malaysia default to Simplified Chinese. Portuguese preferences use the Brazilian Portuguese translation.

Arabic switches layout and keyboard direction to right-to-left, including navigation, dialogs, menus and controls. URLs and hexadecimal colors remain left-to-right; user-entered names and descriptions are not translated. Switching back restores left-to-right layout. Language and personal appearance preferences are not shared site settings and do not enter portable backups. Administrator appearance defaults, custom tokens and CSS are shared settings and do enter backups.

The built-in interface uses system fonts on the **browser's device** and does not download web fonts. Minimal Linux clients need fonts covering the scripts they display, including CJK, Arabic and Devanagari. Missing glyphs or square boxes require a suitable client-side system font, not a change to the server or scratch container.

</details>

## Backup and restore

Use **Manage → Backup → Export backup**. Leave **Include icon files** enabled for a fully restorable copy. Backups contain private names and URLs; protect them and keep a separate copy outside the application data directory. Credentials, sessions, rate-limit state, and audit history are not exported.

Current builds export **backup version 3**, including health-check configuration and shared custom tokens/CSS; versions 1 and 2 remain importable. Browser-only styles, theme libraries and health results are not exported. Restore only trusted backups: enabled health checks resume and contact their configured targets after a successful restore. Review imported CSS and keep a complete pre-upgrade backup for rollback; see [themes and compatibility](docs/themes.md).

<details>
<summary>Restore steps, size limits, and what is preserved</summary>

1. Select a UTF-8 Nexa Home JSON backup, at most 16 MiB.
2. Validate it and review the entity counts and settings-change warning.
3. Explicitly acknowledge replacement, then choose **Replace configuration**.

Restore replaces services, categories, tags, appearance, and icons, but preserves the current administrator, sessions, and audit history. A preview belongs to the current session, expires after five minutes, and is single-use even when a commit attempt fails. Validate again before retrying. Validation rejects unknown/duplicate JSON fields, invalid references or IDs, unsafe content, unsupported versions, and oversized graphs before replacement.

All accepted configuration must fit a **16 MiB full export, including exact base64 icon expansion**. Writes that would exceed this portable budget fail atomically with `409 LIMIT_EXCEEDED`. Other bounds are 5000 services, categories, and tags each; 1024 icons; and nonnegative signed-32-bit positions. An export without icons is not restorable if it still references those missing icons.

</details>

> [!IMPORTANT]
> Do not copy a live SQLite/WAL database as a backup. Prefer the portable export, or stop the process before copying the complete data directory. See [backup, upgrade, and recovery](docs/backup-and-recovery.md) for full-volume backups and credential recovery.

## Documentation

| Guide                                              | What you will find                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Deployment](docs/deployment.md)                   | Docker, HTTPS reverse proxies, storage, and troubleshooting.                              |
| [Backup and recovery](docs/backup-and-recovery.md) | Portable exports, full backups, upgrades, rollback, and credential recovery.              |
| [Themes and advanced CSS](docs/themes.md)          | Five presets, custom tokens, browser libraries, arbitrary CSS, and safe recovery.         |
| [Security](SECURITY.md)                            | Access boundaries, session handling, dependency checks, and the reviewed advisory policy. |
| [Releases](docs/releases.md)                       | Automatic versions, release notes, GHCR images, and release operation.                    |
| [Changelog](CHANGELOG.md)                          | Project changes and the [1.0.0 release notes](docs/release-notes-1.0.0.md).               |
| [HTTP API](api/openapi.yaml)                       | The OpenAPI contract used to generate the JSON and TypeScript definitions.                |

> [!NOTE]
> Raw image scans retain an unused OpenPGP module advisory. Its reviewed path/version-specific exception expires on **2027-02-01** and is valid only while no direct or transitive runtime dependency uses OpenPGP. Other findings remain fatal. See the [security notice](SECURITY.md) for the exact policy.

## Self-hosting reference

<details>
<summary>Local Docker builds, standalone binaries, configuration, storage, and maintenance</summary>

### Docker deployment

To build the image locally, start from a trusted source checkout. Copy `deploy/.env.example` to ignored `deploy/.env` and configure the exact public origin. For isolated loopback testing, use `NEXA_PUBLIC_ORIGIN=http://127.0.0.1:8080` and explicitly set `NEXA_ALLOW_HTTP_COOKIE=true`. For remote access, configure a trusted HTTPS reverse proxy and leave that flag `false`.

```sh
cp deploy/.env.example deploy/.env
# Edit deploy/.env for your own HTTPS domain or the isolated HTTP values above.
docker compose --env-file deploy/.env -f deploy/compose.yaml up --detach --build --wait
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T nexa-home /nexa-home healthcheck
```

The default binding is **127.0.0.1:8080**, not every NAS interface. The named volume persists `/data`; keep the same project name across ordinary upgrades. The image runs as UID/GID `10001:10001` with a read-only root, dropped capabilities, no-new-privileges and no shell or Node. Node/Go are build stages only. Linux amd64 and arm64 use the same Dockerfile, with pinned builder versions/digests.

Read the one-time token locally with `docker compose --env-file deploy/.env -f deploy/compose.yaml logs nexa-home`, then open `/setup` at the configured origin. **Do not publish startup logs or tokens.** A remote browser cannot reach the NAS's loopback address; configure the proxy or an explicitly isolated LAN binding before using another device. These local build commands do not publish an image or run hosted CI.

### Build from source

Build on Linux with Node.js 24.14.1 or newer in the Node 24 line, npm, and the Go toolchain declared in `go.mod` (Go 1.27.4). Node is a build/test dependency only; the resulting executable embeds the frontend and does not need Node at runtime.

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

### Run locally

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

### Configuration

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

### Data ownership

The process user must own the data directory. Use private permissions: `0700` for directories and `0600` for database/lock files. Existing group/other-accessible paths, symlinks for application data paths, and multiply linked lock files are rejected rather than silently changing permissions.

The directory contains:

- `nexa.db`, plus SQLite WAL/shared-memory files while in use.
- `assets/`, containing validated content-addressed icon files.
- `.nexa.lock`, the exclusive process-ownership lock.

Only one application or offline maintenance command may own a data directory. Do not delete the lock file to bypass an ownership error; the process lock is automatically released on exit. Use a local filesystem, not a live synchronized SQLite file or a shared multi-writer NAS mount.

Changing a service's category preserves the service and updates both complete ordering scopes, including hidden services. Deleting a category keeps its services and moves them to Uncategorized; individually visible services can therefore become public. Referenced icons cannot be deleted.

### Health and maintenance

```sh
NEXA_LISTEN=127.0.0.1:8080 ./bin/nexa-home healthcheck
```

`/healthz` reports process liveness; `/readyz` checks database readiness. Neither returns setup tokens or configuration data. The healthcheck command uses the configured listen address, does not follow redirects or environment proxies, and exits nonzero when not ready.

Stop the server before checking a data directory:

```sh
NEXA_DATA_DIR="$PWD/data" ./bin/nexa-home doctor
```

Doctor checks the known schema, SQLite integrity, foreign keys, stored icon hashes/metadata, and image validity. It does not create an administrator, initialize a nonexistent database, or collect orphan files.

</details>

## Development and verification

<details>
<summary>Build and test commands, browser checks, and release tooling</summary>

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

The local container-test, image-scan and release-export helpers require a Docker CLI and daemon supporting platform-aware image operations: `image inspect --platform` needs API **1.49+**, and `image save --platform` needs API **1.48+**. CI installs Docker **29.5.3** and Buildx **0.38.2** through SHA-pinned Docker-maintained Actions rather than relying on the runner's preinstalled versions. Publication-format tests require containerd image storage and `--output type=docker,oci-mediatypes=true` so OCI manifests survive save/load/push. They also exercise a temporary, credential-free loopback registry, verifying release annotations, runtime digests and exact `latest` promotion without external publication or a helper-mounted daemon socket. See the native build commands in the deployment guide. These are development/release tooling requirements, not additional requirements for running a prebuilt image.

After building the Docker image, `npm run test:container` exercises real Compose deployment, fresh-volume cold recovery and verified HTTPS with Secure cookies and exact-origin checks. It requires Docker/Compose, tar and OpenSSL, creates only its own isolated resources, and never installs a host CA or privileged emulator. `npm run scan:image` scans a saved image with pinned Trivy without exposing the daemon socket. Unhandled findings return nonzero and remain visible; reviewed suppressions retain their reasons and source in reports, which stay local/ignored. The Verify workflow runs native amd64/arm64 checks without registry credentials. The Release workflow automatically plans versions and release notes from Conventional Commits on `master`, retaining explicit tag compatibility. Only after both architecture jobs succeed does it create the automatic tag, publish the exact verified images to GHCR and provide versioned executables/checksums. Preview dispatches never publish, and planning failures still run source verification; see [release setup and operation](docs/releases.md). Neither workflow deploys the application to a remote server.

The HTTP contract is in [api/openapi.yaml](api/openapi.yaml); generated JSON and TypeScript remain checked for drift. Do not modify generated artifacts by hand.

Use `npm run dev:web` for the Vite development server. Its `/api` and `/assets` proxy points to `127.0.0.1:8080`; for this isolated development configuration set the Go process's public origin to the Vite origin and explicitly allow HTTP cookies. Production serving does not use Vite or its development server.

</details>

## License

Nexa Home is licensed under the [MIT License](LICENSE). Third-party dependencies retain their respective licenses. Preserve [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) with redistributed binaries/images; the runtime image includes both files under `/usr/share/licenses/nexa-home/`. `npm run notices -- --check` verifies the locked dependency inventory and retained texts.
