# Backup, upgrade and recovery

**English** | [繁體中文](zh-Hant/backup-and-recovery.md)

Keep at least one encrypted copy outside the application data directory and a second failure domain outside the NAS. Choose retention appropriate to your data and test recovery periodically in separate storage. A backup that has never been restored is not sufficient assurance.

## Two different backup types

| Type                          | Contains                                                                     | Credentials and sessions                                                         | Intended use                                                       |
| ----------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Portable JSON with icon files | Services, categories, tags, appearance and validated icon content            | Excluded; the destination administrator/sessions/audit/rate limits are preserved | Configuration recovery and migration to a fresh administrator      |
| Complete stopped data archive | SQLite database, any WAL/shared-memory files, assets and lock inode contents | Includes password/session digests, audit and rate-limit state                    | Exact installation recovery with compatible software and ownership |

Neither backup includes your Compose environment, reverse-proxy configuration or TLS keys. Protect those separately and record the reviewed image/source version. Backups contain private URLs and names; do not attach them to a public issue. The application does not encrypt exports or archives for you.

## Portable export and restore

1. Sign in and open **Manage → Backup**.
2. Leave **Include icon files** enabled and export. A metadata-only export is not restorable if it still references omitted icons.
3. Protect the downloaded UTF-8 JSON and copy it off the application/NAS storage.
4. For a recovery test, create a fresh instance with separate storage, complete protected setup with a new administrator, and sign in.
5. Select the JSON, validate it, review counts and the settings-change warning, acknowledge replacement, and commit once.
6. Verify service links, favorites/order, categories/tags, appearance, visibility/private mode and icon display. The launcher opens only primary links; exporting LAN/WAN alternatives does not enable automatic switching.

Validation/preview does not replace data. Its token is session-bound, valid for five minutes and consumed by a commit attempt even if that attempt fails. Validate again before retrying. A successful restore preserves validated globally unique UUIDv4 IDs and positions, refreshes timestamps/revision, and preserves the destination administrator, sessions, audit and rate limits. Existing settings drafts may conflict afterward and must be explicitly reloaded.

The full restorable configuration is capped at **16 MiB including exact base64 icon expansion**. All accepted entity/icon changes enforce this budget transactionally; overflow returns `409 LIMIT_EXCEEDED` without a partial write. Other caps are 5000 services/categories/tags each, 1024 icons, 1 MiB per icon and positions from 0 through 2147483647. Do not edit away validation failures or reserialize damaged input to conceal duplicate JSON keys. Unsupported backup versions, unsafe content or missing referenced icons must be corrected from a trusted source before import.

Restoring appearance can change public/private mode and visibility. Check the warning and verify the resulting exposure before opening the instance to visitors. Private mode is not backup encryption.

New exports use backup version 3 and include health-check configuration, the shared preset, custom token definition and advanced CSS; browser-only preferences/library entries and health results remain excluded. Versions 1 and 2 still import with health checks disabled; version 1 also defaults missing style extensions to Future Glass without CSS. Review imported CSS as trusted presentation: it may hide controls or change accessibility, even though CSP still blocks external resources and inline/eval scripts. `/?appearance=safe` disables custom styling without bypassing authentication or changing saved data; see [themes and recovery](themes.md). Do not relabel a version 3 backup for an older application.

**Restore only trusted backups.** A successful version 3 restore immediately starts its enabled health checks and contacts their configured targets from the server or container, including reachable private networks. Validation alone does not start them. Review destinations and network access before confirming a restore; keep private endpoint URLs and backups protected. See [security and network boundaries](../SECURITY.md#content-and-network-boundaries).

## Complete stopped Docker archive

**Never copy only a live `nexa.db`, or omit live WAL files.** Use portable export while running, or stop the application and copy the complete data directory. Do not delete the lock file: stopping releases its kernel lock without unlinking the inode.

These examples use the standard project and local environment file. Run from the checkout root. `c` is only a shell convenience function, not an application command:

```sh
set -eu
c() { docker compose --env-file deploy/.env -f deploy/compose.yaml "$@"; }
umask 077
backup_dir=$(mktemp -d "$HOME/nexa-backup.XXXXXXXX")
c stop nexa-home
container=$(c ps --all --quiet nexa-home)
test -n "$container"
docker cp --archive "${container}:/data/." - > "$backup_dir/data.tar"
(cd "$backup_dir" && sha256sum data.tar > data.tar.sha256)
c up --detach --no-build --pull never --wait
printf 'Private backup directory: %s\n' "$backup_dir"
```

The archive stream preserves numeric ownership and private modes without extracting credential material into a public host directory. Keep the directory `0700`, files `0600`, encrypt the off-host copy, and retain the checksum separately where practical. A checksum detects corruption; it is not authenticity protection against an attacker who can replace both files.

If a command fails, the sequence stops; the source may intentionally remain stopped. Inspect the error and decide when to restart it. Do not initialize another service on the same data directory or use a global prune to troubleshoot.

For native operation, stop the process gracefully and archive the **entire** private data directory as its owner, preserving numeric ownership and modes. If moving between native and Docker ownership, prefer portable JSON. A complete archive retains the original UID; do not solve a mismatch with world-writable permissions.

## Recover an archive into separate storage

Do not experiment on the only production copy. Keep the source volume and archive untouched. Use the exact compatible image/source version recorded with the backup; an older executable refuses an unknown newer schema rather than downgrading it.

1. Verify the trusted archive checksum from its directory:

   ```sh
   cd /absolute/private/backup-directory
   sha256sum -c data.tar.sha256
   ```

2. Return to the source checkout. Copy the environment file to ignored `deploy/.env.recovery`. Edit it for isolated recovery: loopback binding, an unused port such as `18081`, exact origin `http://127.0.0.1:18081`, no trusted proxies, and the explicit local HTTP-cookie exception. Keep it off the Internet. Select the compatible locally built image.

3. Choose a new, never-used project name and verify it has no containers or volumes. Keep that name for every recovery command:

   ```sh
   set -eu
   recovery_project="nexa-recovery-$(date -u +%Y%m%d%H%M%S)-$$"
   existing_containers=$(docker ps -aq --filter "label=com.docker.compose.project=$recovery_project")
   existing_volumes=$(docker volume ls -q --filter "label=com.docker.compose.project=$recovery_project")
   test -z "$existing_containers"
   test -z "$existing_volumes"
   r() { docker compose --project-name "$recovery_project" --env-file deploy/.env.recovery -f deploy/compose.yaml "$@"; }
   r create --no-build --pull never nexa-home
   target=$(r ps --all --quiet nexa-home)
   test -n "$target"
   ```

4. Restore only into this fresh stopped container/volume. Set `backup_dir` to the absolute verified private backup path:

   ```sh
   docker cp --archive - "${target}:/data" < "$backup_dir/data.tar"
   r run --rm --no-deps nexa-home doctor
   r up --detach --no-build --pull never --wait
   ```

5. Open the isolated recovery origin and sign in with the **archived** administrator credentials. A complete archive preserves initialization and sessions; it must not issue a new setup token. Verify all icons, catalog/order/visibility/settings, a new portable export, and a normal mutation. Doctor checks known schema, SQLite integrity, foreign keys and stored icon bytes; it neither resets credentials nor collects orphans.

6. Before promotion, stop recovery and the production instance. Restore production HTTPS/origin/cookie settings. Either perform another complete stopped copy into a new production volume, or explicitly switch the production mount to the verified recovered volume. Preserve the old volume. Never run the staging and production applications against the same data simultaneously. Keep the chosen mount/project mapping in your protected deployment configuration.

A mount-switch override can name the verified recovered volume as **external**, so production Compose does not own or delete it:

```yaml
services:
  nexa-home:
    volumes:
      - recovered_data:/data
volumes:
  recovered_data:
    external: true
    name: REPLACE_WITH_THE_VERIFIED_RECOVERY_VOLUME_NAME
```

Store local overrides under ignored `.local/` and include them consistently in subsequent Compose commands. The recovery project and its volume must remain preserved while production uses that external volume. Do not run `down --volumes` on either project during this retention period. Once independent backups and the new production instance are verified, any cleanup is a separate explicit operator decision on exact known resources, never a query-selected bulk deletion.

## Upgrade protocol

1. Review release notes and supported architectures/schema changes. Pin a reviewed source revision or verified image; do not use an unreviewed floating image.
2. Export a full portable JSON with icons. Take a complete stopped archive and record the exact old image/source and deployment configuration.
3. Build the target version locally, or obtain a separately verified release artifact. Preserve the data volume, project name, origin, proxy trust and private ownership. Local builds and non-release-branch/PR checks do not publish images; automatic `master` and explicit tag publication are described in the [release guide](releases.md).
4. Start one target instance with the preserved volume. Startup serializes migration with the data lock, checks the known schema and takes a safe pre-migration snapshot before forward migrations. Such an on-volume snapshot is not a substitute for the off-volume backup and its matching assets.
5. Check readiness, version, restricted logs, login, public/private behavior, icons and a fresh export. Confirm a graceful stop/start preserves data and expected sessions.
6. Keep the previous backup/image until the new version is accepted. Do not discard evidence after only a successful healthcheck.

For rollback, first stop the target. Use an older executable only with a schema it supports. If the schema advanced, recover the **pre-upgrade complete backup** into separate storage with its compatible old image, verify it, then switch mounts while both instances are stopped. Never force `user_version`, edit the initial migration or overwrite only the database while leaving mismatched assets.

The theme migration `002_themes.sql` advances schema 1 to 2; `003_service_health.sql` advances it to 3. When the current build upgrades an existing database directly to schema 3, it first writes private `nexa.pre-migration-v1-to-v3.db` or `nexa.pre-migration-v2-to-v3.db`, according to the starting schema. An earlier theme-only build instead used `nexa.pre-migration-v1-to-v2.db`. Each on-volume snapshot includes committed WAL and authentication state, but not matching icon files or an off-volume copy. It is never overwritten. An existing destination while migration remains pending blocks startup; stop the service, inspect the failure and preserve/move that exact snapshot before a deliberate retry. Normal restarts after a successful upgrade do not create more snapshots. `doctor` uses a read-only connection and does not migrate supported schemas. Keep the complete pre-upgrade archive for an actual rollback.

## Credential loss and incident recovery

There is no default password, email reset or unauthenticated reset endpoint. If the administrator password is lost, keep the old installation intact, create a new private data directory/volume, complete protected setup, and import the latest **portable** backup. That intentionally installs a new administrator while recovering configuration. A complete stopped archive instead restores the old account/password digest; cloning it does not reset an unknown password. Without a usable portable backup, there is no supported automated credential-reset workflow; preserve the data and seek a trusted maintainer's offline assistance rather than deleting tables or data.

For suspected compromise, isolate access, preserve a stopped forensic copy and protected logs, then use a clean host/image and trusted backup. Rotate the administrator password to revoke all sessions and inspect service URLs, visibility, icons and proxy settings before reopening access. Infrastructure copies can restore old session digests, so password rotation is important after incident recovery. Rotate any unrelated NAS/service credentials exposed in private URLs outside Nexa Home as well.

A corrupt or unsafe directory should fail closed. Keep the archive and logs private, run doctor only offline, and restore a known-good copy into new storage. Do not hide corruption with `chmod 777`, disable file locks, edit schema versions, skip TLS verification or delete the only backup.
