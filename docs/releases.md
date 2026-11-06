# Releases and container publishing

**English** | [繁體中文](zh-Hant/releases.md)

Merging or pushing reviewed changes to **`master`** is the normal publication trigger. The workflow calculates a version and release notes from Conventional Commits, verifies both native Linux architectures, and only then creates the tag and publishes. You do not manually bump package versions or create a tag for ordinary releases. This document describes configured behavior, not evidence of an existing hosted run, tag, GitHub Release or registry image. Local build/test commands do not publish.

## Registry and repository setup

Images use `ghcr.io/<owner>/<repository>`, the current GitHub repository name in lowercase. Only the publishing job has short-lived `GITHUB_TOKEN` permissions `contents: write` and `packages: write`. Planning, PR checks and native verification are read-only; no Docker Hub account, long-lived PAT or npm-publishing secret is needed.

Before enabling automatic releases:

1. Enable GitHub Actions and permit the publishing job's requested permissions under repository/organization policy.
2. Configure the environment named `release` to allow **`master` and the intended `v*` tags**. Add required reviewers if desired. Without reviewers the configured flow is automatic; the YAML environment name alone does not require approval.
3. Protect `master`, require reviewed PRs and successful native verification plus **Conventional PR title**, and enable squash merging with the **PR title and description** as the squash commit message. The lightweight title workflow also reruns on title edits; those runs do not replace source-verification checks. Review direct pushes carefully: a releasable direct push to `master` also publishes.
4. Protect version tags against unauthorized creation/updates while allowing the release identity to create new tags. Do not grant it permission to rewrite released tags. Review workflow, release-tool and lockfile changes as executable publishing policy.
5. For an existing GHCR package, grant this repository's Actions access. After the first push, review package visibility: it may initially be private. An owner must explicitly enable public access for anonymous pulls; the workflow does not change visibility.
6. Confirm the release baseline before rollout. With no successful published version the first relevant change releases `1.0.0`. An existing successful `v1.0.0` is a baseline, not a version to recreate. Drafts, prereleases and unrelated tags are not the automatic stable baseline.

The workflow publishes downloads/images, not an application deployment to a NAS or remote server. Adopting this workflow on `master` may itself trigger the first real release.

## Commit and version policy

The highest change since the latest successful stable release reachable from the source commit determines one version:

| Commit | Result from `1.4.2` |
| ------ | ------------------- |
| `fix: correct a defect` | Patch: `1.4.3` |
| `perf: reduce search work` | Patch: `1.4.3` |
| `feat: add a feature` | Minor: `1.5.0` |
| `feat!: change behavior`, `fix(api)!: change a contract`, or a `BREAKING CHANGE:` footer | Major: `2.0.0` |
| `docs`, `test`, `ci`, `chore`, `build`, `style`, or ordinary `refactor` only | Verification without a release |

Breaking changes on any type still release a major version. A feature and its matching revert in the same range cancel out. Use an allowed Conventional Commits type in PR titles; arbitrary titles fail the title check. Do not rely on a PR description surviving a squash unless repository merge settings preserve it.

Version tags are `vMAJOR.MINOR.PATCH`, optionally with a manual prerelease such as `v1.1.0-rc.1`. Numeric version/prerelease identifiers cannot have leading zeroes; empty identifiers, whitespace and `+build` metadata are rejected. Docker version tags omit `v` and are limited to 128 ASCII characters. Automatic releases are stable releases on `master`; no beta/next branch is introduced.

## Version files and source builds

Successful release tags are the version authority. Root `package.json`, `apps/web/package.json` and their lockfile entries remain a coherent **development baseline**, not an automatically committed release ledger. Verification validates a source-bound plan, stamps all version fields in its temporary checkout, then builds. It does not push a version-bump or generated CHANGELOG commit to `master`.

`npm run build` resolves `NEXA_BUILD_VERSION` first, then an exact version tag at the checked-out commit, then the development baseline. Ambiguous local version tags require an explicit override. A Git-less source archive also needs the explicit version when reproducing a release. For example, this builds locally and does not publish:

```sh
NEXA_BUILD_VERSION=1.1.0 npm run build
./bin/nexa-home version
```

Direct Go builds need equivalent `-ldflags "-X main.version=VERSION"`. Manual Docker builds must pass the matching `VERSION` build argument; the local fallback remains `1.0.0`. CI always passes the plan version and exact source revision/source URL. Retain Go symbols for executable vulnerability analysis.

The two official semantic-release analysis plugins and the Conventional Commits preset are exact-locked development tools. They are called as standalone APIs, not the full release engine. `.npmrc` disables automatic peer installation to avoid pulling in unused semantic-release/npm publishing clients; the Docker build uses the matching install flag. Required frontend peers are explicitly declared. This is dependency selection, not an audit exclusion: the complete installed/locked development dependency audit remains a gate.

## Automatic release notes

The official commit analyzer and release-notes generator share the same Conventional Commits preset and commit range. Notes include features, fixes, performance changes, breaking descriptions, commit/issue/PR references where present, and the previous-to-next tag comparison link. English commit descriptions are retained; no AI translation or external text service is used.

The release date is the source commit's UTC date, making planning/retries deterministic. A bounded plan binds version, source SHA, previous release SHA/tag, change type, date and generated notes under SHA-256. Both architecture manifests must carry that identity. The GitHub Release body uses these exact notes, plus image/license information and the verified immutable image digest; it does not delegate change selection to GitHub's generic generated-notes command.

GitHub Releases are the automatically generated per-version history. Repository `CHANGELOG.md` and its Traditional Chinese counterpart remain curated overviews; product manuals are not machine-translated or automatically rewritten on every release.

## Verification and publishing order

[Release](../.github/workflows/release.yaml) plans on a `master` push, a compatible manual tag push, or an explicit dispatch. It fetches complete history/tags and reads published releases without write permission. It calls the same [Verify workflow](../.github/workflows/ci.yaml) used by branch/PR checks; `master` does not also trigger a duplicate standalone Verify push run. No-release changes still run full verification. If planning fails, ordinary source verification still runs without versioned artifacts, and publication remains blocked.

Native `ubuntu-24.04` amd64 and `ubuntu-24.04-arm` arm64 jobs run:

1. Workflow lint, generated-contract/API/docs/policy checks, TypeScript, ESLint and build compatibility.
2. Release-tool/frontend tests, embedded application build, license inventory, Go race/vet and input fuzzing. Frontend test concurrency is bounded; no test or timeout is removed.
3. Dependency audits, source/executable vulnerability scans and an explicit rejection of direct/transitive OpenPGP runtime imports.
4. The actual built-application Chromium E2E suite.
5. Version/revision-stamped native OCI builds, real Compose/HTTPS/cold-recovery acceptance and policy-aware image scans.
6. Exact-image executable extraction, ELF architecture/reported-version validation, portable archive creation and another executable vulnerability scan.

Verification and publishing use one [shared Docker toolchain](../.github/actions/docker-toolchain/action.yaml). SHA-pinned, Docker-maintained `docker/setup-docker-action` and `docker/setup-buildx-action` install Docker **29.5.3** (client and daemon) and Buildx **0.38.2**, explicitly select the installed daemon and enable the containerd image store. The `docker` builder driver uses that daemon; native jobs need no emulator or separate privileged builder container. An early version/API check rejects an unsupported client or daemon instead of removing platform selection from image inspection/export.

`docker/build-push-action` builds with the checkout's path context (`.`), so validated temporary version stamps are included rather than ignored by the default Git context. It uses `load: true`, `outputs: type=docker,oci-mediatypes=true` and `push: false`: the containerd image store retains OCI manifests through inspection, save/load and push. Without explicit OCI media types, Buildx can combine Docker-format sources into a Docker manifest list and silently omit the requested index annotations. The publisher requires an OCI index and all version/revision/source annotations; these checks are never skipped. Deployment acceptance, a credential-free loopback-registry roundtrip and scanning run before external publication. The registry test checks annotation retention, unchanged runtime digests and exact `latest` promotion without exposing the daemon socket to a helper. Docker build-record uploads and build summaries are disabled; only the declared plan and architecture artifacts are retained.

A versioned plan exports both verified architecture artifacts; no-release verification does not. The same-run plan/artifacts expire after seven days. Uploads contain declared public build files, never application data, credentials, startup logs, browser traces or local process reports. Reruns replace only their own same-run named artifacts; downloads never select a different run.

Only the environment-gated publisher receives write permission. It checks the plan digest and complete artifact set before registry login, then uses SHA-pinned `docker/login-action` with a private `DOCKER_CONFIG`, the job's short-lived token and post-job logout. It rechecks the published baseline, creates an annotated automatic tag at the tested SHA, and creates its own draft. The tag contains a bounded public plan receipt, allowing recovery without relying on expired Actions artifacts. Existing automatic tags must match that exact receipt; manually managed tags are not silently adopted.

The publisher loads and pushes the tested image archives **without rebuilding**. It does not invoke `build-push-action` a second time: the remaining `docker load`/`tag`/`push` and `buildx imagetools` commands publish the already verified images, not another build. Immutable pushed digests form a two-platform index whose runtime descriptors must equal the verified architectures. Assets/notes are uploaded, the tag/baseline are checked again, and only then is the draft made public. A tag created with `GITHUB_TOKEN` does not trigger another push workflow; this pipeline completes directly rather than relying on such recursion.

All releases share a non-cancelling workflow concurrency group and serialized publication. GitHub concurrency is not a FIFO queue and may replace pending runs; later planning covers commits not yet successfully released. The reviewed unused OpenPGP exception remains conditional, exact-version/path-scoped and expiring; see [security](../SECURITY.md). A failed/expired gate blocks publication rather than relaxing policy.

## Preview and compatible manual tags

The default manual dispatch is a **preview**, including read-only planning and full verification but no tag, registry or Release writes. These commands start hosted workflows; they are not local tests:

```sh
gh workflow run release.yaml --ref master -f mode=preview
```

Inspect the plan/notes in the run summary and its `release-plan` artifact. Ordinary reviewed merges to `master` need no version command or tag command.

An authorized maintainer can still deliberately publish a reviewed commit using an unused explicit version tag, including a prerelease/backport. This overrides automatic version selection but not verification. The commands below are a **publication trigger**, not a test:

```sh
VERSION=1.1.0-rc.1
git tag -a "v$VERSION" -m "Nexa Home $VERSION"
git push origin "v$VERSION"
```

Do not manually change development package versions just for this tag. The workflow stamps the selected tag version in the isolated build. The tagged source must contain the reviewed workflow/tools. Never force-push an existing release tag.

## Image tags and latest

| Reference | Meaning |
| --------- | ------- |
| `ghcr.io/owner/repository:1.1.0` | Stable Linux amd64/arm64 index |
| `ghcr.io/owner/repository:1.1.0-rc.1` | Manual prerelease index; never promotes `latest` |
| `ghcr.io/owner/repository:latest` | Promoted only for a stable version newer than existing published stable releases |
| `ghcr.io/owner/repository@sha256:...` | The exact index digest recorded in the release |
| `build-<run>-<attempt>-<arch>` | Internal staging tags, not deployment aliases |

Older stable backports do not move Docker `latest` or GitHub Latest backwards. No automatic major/minor aliases are created. Treat published version tags as immutable; use an index digest for exact deployment.

## Download assets and integrity

Each GitHub Release provides:

- `nexa-home_VERSION_linux_amd64.tar.gz`
- `nexa-home_VERSION_linux_arm64.tar.gz`
- `image-digest.txt`, the fully qualified registry index digest
- `SHA256SUMS`, covering both archives and `image-digest.txt`

Each executable archive contains only `nexa-home`, `LICENSE` and `THIRD_PARTY_NOTICES.md`. It contains no Node, Go, test tools or application data. Preserve original license texts when redistributing it.

Download all four assets from the intended repository's HTTPS release page into an empty directory, then verify and extract the appropriate architecture:

```sh
VERSION=1.1.0
ARCH=amd64
sha256sum --check SHA256SUMS
mkdir "nexa-home_${VERSION}_${ARCH}"
tar -xzf "nexa-home_${VERSION}_linux_${ARCH}.tar.gz" \
  -C "nexa-home_${VERSION}_${ARCH}"
"./nexa-home_${VERSION}_${ARCH}/nexa-home" version
```

Use `ARCH=arm64` on AArch64. Checksums detect corruption, not publisher identity through a separate signature system. Verify the repository and HTTPS origin. Set private data-directory/transport options from the [readme](../readme.md#run-locally) before starting the application.

## Use a published image

For an image-only deployment without a source checkout, use the root [compose.yaml](../compose.yaml) and [.env.example](../.env.example). The deployment guide covers its standalone quick start, HTTPS settings and persistent volume. It defaults to the upstream stable `latest`; set `NEXA_IMAGE` to the intended repository/version or immutable index digest for controlled deployment. The existing source-build Compose remains available with an explicit image override and `--no-build` as shown below.

Replace the owner/repository and version below with a release that actually exists:

```sh
IMAGE=ghcr.io/owner/repository
VERSION=1.1.0
docker pull "$IMAGE:$VERSION"
docker buildx imagetools inspect "$IMAGE:$VERSION"
```

Set `NEXA_IMAGE` in ignored `deploy/.env` to the version reference or exact `image-digest.txt` reference. Keep [deployment](deployment.md) HTTPS/origin/data settings. Do not replace a published image with a local rebuild:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml pull
docker compose --env-file deploy/.env -f deploy/compose.yaml \
  up --detach --no-build --pull always --wait
```

The index selects the host's Linux architecture. Private packages need an appropriate registry login; never put credentials in Compose, image URLs or public logs.

## Reruns and failure recovery

Before tag creation, rerun the original `master` run at its original SHA. After an automatic tag exists, rerun that run or explicitly resume the same immutable tag:

```sh
VERSION=1.1.0
gh workflow run release.yaml --ref "v$VERSION" -f mode=resume
```

`resume` on a branch is rejected; default `preview` never publishes. An automatic tag's plan receipt preserves the original type, baseline, notes and digest even when dispatching through a tag. Expired artifacts require complete verification again, not a skipped gate. A manual tag can resume only its same-plan draft. A published Release is a no-op during planning and cannot be overwritten.

If an unfinished version belongs to an earlier SHA, a later `master` commit cannot take it over or move its tag. For a transient service/access failure, resume the original source first; later planning can then include subsequent changes. A changed published baseline, moved tag, altered receipt or foreign draft stops publication. Inspect and resolve the exact state rather than deleting/replacing tags automatically.

If the existing tag points to a **workflow/publisher code defect**, rerunning its old SHA or dispatching that tag still executes the old code. Merge the reviewed fix into `master`, then deliberately publish an **unused higher explicit version** from that fixed master commit. For example, after an unfinished `v1.0.0`, use `v1.0.1` if it is available. Keep the old tag, image state and draft untouched; do not move the tag or transplant the new source into its plan. Automatic planning may intentionally refuse the occupied version until a new successful release supplies the baseline. After the newer release succeeds, ordinary automatic releases can continue from it.

The following is a **publication trigger**, not a test. Replace `FIXED_SOURCE` with the full reviewed fixed commit on `master`, and confirm the version is unused before running:

```sh
VERSION=1.0.1
FIXED_SOURCE=replace-with-full-reviewed-master-commit
git tag -a "v$VERSION" -m "Nexa Home $VERSION" "$FIXED_SOURCE"
git push origin "v$VERSION"
```

All native verification and publishing gates still run for that new tag; this is not a bypass or an overwrite of the unfinished release.

GHCR and GitHub Releases are not atomic. Failure/cancellation can leave an annotated tag, staging/version/latest image state or an unpublished pipeline-owned draft before the GitHub Release becomes public. No registry version or published Release is automatically deleted. Fix access/visibility in repository/package settings, not with source-embedded long-lived credentials. Never disable TLS or broaden a security exception to pass release gates. Environment reviewers, tag/branch protections and access controls remain operator responsibilities.
