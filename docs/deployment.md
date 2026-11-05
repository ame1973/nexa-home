# Deployment

**English** | [繁體中文](zh-Hant/deployment.md)

## Prerequisites

- A Linux `amd64` (x86-64) or `arm64` (AArch64) host, or Docker running Linux containers.
- Docker with BuildKit and Compose v2.24.4 or newer for the supplied commands/tests. The native executable needs no Node runtime; Docker builds obtain pinned Node/Go builder images automatically.
- Private, writable, persistent **local** storage. Do not use live SQLite on NFS/SMB, a synchronized folder, or a shared multi-writer volume.
- An HTTPS reverse proxy and a trusted certificate for remote access. A firewall must prevent bypassing that proxy.

Build from a reviewed source checkout and its dependency lockfiles. These instructions build locally; they do not assume that any registry image or release tag has been published. To use an existing published image without rebuilding it, follow the [release guide](releases.md#use-a-published-image).

## Docker Compose

From the repository root:

```sh
cp deploy/.env.example deploy/.env
```

Edit `deploy/.env`. For production HTTPS, set your actual browser origin and keep insecure cookies disabled:

```dotenv
NEXA_IMAGE=nexa-home:1.0.0
NEXA_HOST_BIND=127.0.0.1
NEXA_HOST_PORT=8080
NEXA_PUBLIC_ORIGIN=https://home.example.com
NEXA_TRUSTED_PROXY_CIDRS=
NEXA_ALLOW_HTTP_COOKIE=false
NEXA_LOG_LEVEL=info
```

Replace `home.example.com` with your own domain. Leaving proxy trust empty is safe: the peer's address, rather than untrusted forwarded client addresses, is used. Configure a narrow actual peer CIDR only when you know the proxy topology.

Build and start:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml up --detach --build --wait
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T nexa-home /nexa-home healthcheck
```

The default named volume is `nexa-home_nexa_data`. Keep the same Compose project name across normal upgrades. A different `--project-name` intentionally creates different storage; an unexpected setup screen is a reason to stop and check the mount, not to overwrite or initialize an old installation.

Read the one-time setup token **locally**:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml logs nexa-home
```

Startup logs contain a live credential before initialization. Do not paste them into an issue or public terminal recording. Open your configured HTTPS origin at `/setup`, create the administrator, then sign in. No default account/password exists. The token expires after 30 minutes; restarting an uninitialized service issues a new token.

The runtime is a scratch image: UID/GID `10001:10001`, private `/data`, no shell/Node/compiler/package manager, dropped capabilities, no-new-privileges and a read-only root filesystem. `/tmp` is a 16 MiB noexec/nosuid/nodev tmpfs. Compose provides a 512 MiB memory limit, 128-PID limit, bounded JSON logs and 40 seconds of stop grace for the application's 30-second drain. If you change deployment resources, test imports and graceful shutdown under the resulting limits.

Do not add a Docker socket, privileged mode, host networking or unrelated host mounts. `docker compose exec ... sh` is not a maintenance interface; use `healthcheck`, `doctor` and the backup UI instead.

## Isolated HTTP exception

For loopback testing, change the local environment file to:

```dotenv
NEXA_HOST_BIND=127.0.0.1
NEXA_HOST_PORT=8080
NEXA_PUBLIC_ORIGIN=http://127.0.0.1:8080
NEXA_TRUSTED_PROXY_CIDRS=
NEXA_ALLOW_HTTP_COOKIE=true
```

Recreate the service with the same `up` command and open `http://127.0.0.1:8080`. A browser on a different machine cannot reach the NAS's loopback address. For a deliberately isolated LAN installation, bind to the NAS's actual LAN address and set the matching `http://NAS-LAN-IP:port` origin. Restrict the port to that trusted LAN. **Never expose this HTTP exception to the Internet.** Do not weaken TLS checks for a certificate error; fix the certificate or trusted CA.

## HTTPS and proxy trust

The [NGINX site example](../deploy/nginx.conf.example) belongs inside an existing `http {}` context. Supply your certificate/key, replace the hostname, and adjust the loopback backend port if needed. The proxy terminates TLS; Nexa Home itself serves HTTP behind it.

The example:

- Preserves all paths and the original host, including a nondefault port.
- Replaces incoming forwarded client history at a single edge proxy.
- Allows the 16 MiB backup body, disables shared caching and avoids proxy body/response disk buffering.
- Allows a five-minute import response without replacing the application's own limits.
- Preserves the application's CSP and other security headers, and adds host-scoped HSTS. Enable HSTS only for a hostname you will keep on HTTPS; the example does not preload or include unrelated subdomains.

Configure HTTP-to-HTTPS redirection and certificate renewal in your existing proxy/NAS service. Publish at `/`, not `/nexa/`. Do not add a separate SPA fallback, static `/assets/` alias, shared API cache, permissive CORS headers, or CSP `unsafe-inline` scripts at the proxy.

`NEXA_PUBLIC_ORIGIN` must be the exact browser origin. Forwarded host/protocol headers never redefine it. A host reverse proxy talking through a Docker-published port may appear to the app as the Docker bridge gateway, not `127.0.0.1`. If accurate forwarded client addresses are required, determine the actual peer and trust its exact address or dedicated network. Never trust all addresses or unrelated containers. An empty trusted-proxy list is preferable to guessing.

## Storage and bind mounts

The named volume inherits the image's `10001:10001` ownership and `0700` directory mode. The application creates database/lock files as `0600` and refuses unsafe existing paths instead of silently chmod/chowning them.

If NAS tooling requires a bind mount, create a new dedicated directory first, owned by UID/GID `10001:10001`, mode `0700`. Do not recursively change ownership of an existing shared NAS directory. Use an override such as:

```yaml
services:
  nexa-home:
    volumes:
      - type: bind
        source: /absolute/private/path/nexa-data
        target: /data
        bind:
          create_host_path: false
```

A missing directory should fail, not become an automatically created root-owned `0755` path. Secure any existing database/asset files while the service is stopped and after taking a backup. Reject symlinks rather than using them as a data-directory shortcut. The same `/data` must never be opened by two applications or a running application plus offline doctor.

## Native executable

See the root [readme](../readme.md) for source build, environment variables and local startup. Run as a dedicated nonroot user who owns the private absolute data path. The executable embeds the SPA and uses one SQLite connection; there is no Node service or separate static web server.

`/healthz` is process liveness; `/readyz` checks database readiness. Neither exposes configuration or setup credentials. `healthcheck` calls the local configured listener with a three-second timeout, without environment proxies or redirect following. It does not probe stored service URLs.

## Verification and troubleshooting

```sh
# Build only the host's native architecture; works with classic image storage.
docker buildx build --load --file deploy/Dockerfile --tag nexa-home:1.0.0 .
npm run test:container
npm run scan:image
```

Container tests require Node 24, locked npm dependencies, Docker/Compose, tar and OpenSSL. They create only isolated, uniquely named local projects, consume startup credentials in memory, and remove their own resources. They test real setup/login, icons/catalog, portable restore, replacement containers, stopped archive recovery to fresh storage, permissions, health, sessions and offline doctor. HTTPS validation uses a private test CA, not disabled TLS verification.

To build a local dual-architecture index without publishing:

```sh
docker buildx build --platform linux/amd64,linux/arm64 --load \
  --file deploy/Dockerfile --tag nexa-home:1.0.0 .
```

Multi-platform `--load` requires Docker's containerd image store. With classic storage, build/load a single platform at a time or export a local OCI archive. Cross-compilation alone is not runtime acceptance: run `NEXA_TEST_PLATFORM=linux/arm64 npm run test:container` on an ARM64-capable engine. The optional `NEXA_TEST_QEMU=/absolute/path/to/qemu-aarch64` test setting mounts a user-mode interpreter read-only and prefixes the test entrypoint/healthcheck; it never enables privileged mode or registers host binfmt. The interpreter is not shipped in the image. CI defines native amd64 and arm64 jobs; merely having a workflow file does not mean a hosted run occurred.

Common failures:

- **Setup appears after restart:** check the exact project/volume/data path. Preserve the old volume and stop before initializing a mistaken fresh one.
- **Ownership error:** use the intended UID and private modes on the dedicated stopped data directory. Never use `chmod 777` or delete `.nexa.lock` as a workaround.
- **Login does not persist:** verify HTTPS, origin and cookie policy. Do not turn on insecure cookies on a public endpoint.
- **403 on mutations:** check the exact external origin, root-path proxying, active session/CSRF and client clock. Do not disable origin checks.
- **Unhealthy/unknown schema:** inspect local restricted logs, stop the service and run offline doctor. Do not reset or overwrite the database.
- **Trivy exits nonzero:** retain the report and assess the actual finding. The narrowly reviewed unused OpenPGP advisory rule in [SECURITY.md](../SECURITY.md) is version/path-scoped, expires on 2027-02-01 and never permits actual OpenPGP runtime imports. Do not broaden it to make a failure disappear.

Use [backup, upgrade and recovery](backup-and-recovery.md) before changing data paths, images or schemas. Never run a global Docker prune as an application maintenance step.
