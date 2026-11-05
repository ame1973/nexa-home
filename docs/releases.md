# Releases and container publishing

**English** | [繁體中文](zh-Hant/releases.md)

The repository contains a tag-triggered release workflow. This describes what that workflow will do; it does **not** assert that a tag, GitHub Release, registry image or hosted workflow run already exists. Pushing a matching tag or manually dispatching the workflow on a tag authorizes external publication. The local build and verification commands do not publish anything.

## Registry and repository setup

Images are published to `ghcr.io/<owner>/<repository>`, using the current GitHub repository name in lowercase. No Docker Hub account or long-lived registry secret is required. The publishing job uses its short-lived `GITHUB_TOKEN` with `contents: write` and `packages: write`; ordinary branch/PR verification retains `contents: read`.

Before the first release:

1. Enable GitHub Actions and permit the release job's requested permissions under the repository/organization policy.
2. Configure the GitHub environment named `release`. Add required reviewers and version-tag deployment restrictions as appropriate. Naming an environment in YAML does **not** automatically enable approvals.
3. Protect version tags and review changes to workflows, release scripts and dependency lockfiles. Tag issuers and workflow maintainers are trusted to publish executable code.
4. If the GHCR package already exists, grant this repository Actions access to it. The image's source label associates it with the repository.
5. Review package visibility after the first push. GHCR packages may initially be private; the owner must explicitly allow public access for anonymous pulls. This workflow does not change visibility.

The workflow publishes images and download assets; it does not deploy an application to a NAS or another server.

## Version policy

- Git tags must be `vMAJOR.MINOR.PATCH`, optionally followed by a SemVer prerelease such as `v1.1.0-rc.1`.
- The tag without `v` must equal the versions in root `package.json`, `apps/web/package.json` and both corresponding entries in `package-lock.json`.
- Leading zeroes in numeric version components or numeric prerelease identifiers, empty identifiers, whitespace and build metadata (`+build`) are rejected. The image version is limited to 128 ASCII characters.
- The Go executable version and OCI version label are stamped from that validated version. OCI revision/source labels identify the exact checked-out commit and repository. Both lightweight and annotated tags are supported.
- Never move a released tag. Publication checks that the remote tag still resolves to the verified commit before writing release state and again before final promotion.
- A published GitHub Release is not overwritten. Fixes require a new version. Only an unfinished draft created by this pipeline for the same commit can be resumed.

`npm run build` stamps the root package version into the native executable. Direct Go builds must supply the equivalent `-ldflags "-X main.version=VERSION"` when a specific version is required. For manual Docker builds, pass the matching `VERSION` build argument; the existing local default is `1.0.0`, while CI always passes the validated source version explicitly.

## Prepare and trigger a release

Use a reviewed checkout and an explicit version. The following example prepares a future stable version; it is not a claim that `1.1.0` has been released:

```sh
VERSION=1.1.0
npm version "$VERSION" --workspaces --include-workspace-root \
  --no-git-tag-version --ignore-scripts
node scripts/release.mjs version
npm run test:release
npm run build
npm run notices -- --check
```

Update the English/Traditional Chinese changelog and release documentation, run the normal [verification suite](../readme.md#development-and-verification), and commit/review the changes. The npm command changes the two package versions and their lockfile without creating a Git commit/tag or running package lifecycle scripts. It does not publish an npm package.

After review/merge, check out the exact commit intended for release. The commands below are the **publication trigger**, not a local test:

```sh
VERSION=1.1.0
git tag -a "v$VERSION" -m "Nexa Home $VERSION"
git push origin HEAD
git push origin "v$VERSION"
```

If releasing the current `1.0.0` source without a version change, use `VERSION=1.0.0` after reviewing that exact source. Do not force-push an existing version tag.

## Verification and publishing order

[Release](../.github/workflows/release.yaml) validates the tag/version, then calls the same [Verify workflow](../.github/workflows/ci.yaml) used by branch/PR checks. Its native `ubuntu-24.04` amd64 and `ubuntu-24.04-arm` arm64 jobs run:

1. Workflow lint, generated-contract/API/docs/policy checks, TypeScript, ESLint and build-compatibility checks.
2. Release-tool and frontend tests, embedded application build, license inventory, Go race/vet and input fuzzing.
3. Dependency audits, source/executable vulnerability scans and an explicit rejection of direct/transitive OpenPGP runtime imports.
4. The actual built-application Chromium E2E suite.
5. A version/revision-stamped native OCI build, real Compose/HTTPS/cold-recovery acceptance and the policy-aware image scan.
6. Extraction of the executable from that exact image, verification of its ELF architecture/reported version, portable archive creation and another executable vulnerability scan.

Only successful tag verification exports the two architecture artifacts. They contain explicit public build files, not application data, browser traces, startup logs, credentials or local process reports. Temporary artifacts expire after seven days. A rerun can replace only its own same-run architecture artifact; downloads are scoped to the current workflow run.

The separate `release` environment publishing job validates the complete artifact set, source identities and SHA-256 hashes before registry login. It loads the checked image archives and pushes them **without rebuilding**. Immutable pushed digests are combined into a two-platform index; its runtime descriptors must match both tested architectures before release assets are uploaded and the draft is published.

The reviewed unused OpenPGP exception remains conditional, version/path-scoped and expiring. It does not bypass affected-package/symbol checks; see [security](../SECURITY.md). A failed or expired security gate blocks publication rather than weakening the policy.

## Image tags and latest

| Reference | Meaning |
| --------- | ------- |
| `ghcr.io/owner/repository:1.1.0` | The stable version index for Linux amd64 and arm64 |
| `ghcr.io/owner/repository:1.1.0-rc.1` | A prerelease index; never promotes `latest` |
| `ghcr.io/owner/repository:latest` | Promoted only for a stable version newer than existing published stable releases |
| `ghcr.io/owner/repository@sha256:...` | The exact index digest recorded in the release |
| `build-<run>-<attempt>-<arch>` | Internal staging tags used to assemble the index; not deployment aliases |

Git tags include `v`; Docker version tags do not. Older stable backports do not move either Docker `latest` or GitHub's Latest designation backwards. There are no automatic major/minor aliases. Published version tags should be treated as immutable; pin an index digest for an exact deployment.

## Download assets and integrity

Each GitHub Release provides:

- `nexa-home_VERSION_linux_amd64.tar.gz`
- `nexa-home_VERSION_linux_arm64.tar.gz`
- `image-digest.txt`, containing the fully qualified registry index digest
- `SHA256SUMS`, covering both archives and `image-digest.txt`

Each executable archive contains only `nexa-home`, `LICENSE` and `THIRD_PARTY_NOTICES.md`. Node, Go, test tools and application data are not included. Preserve the license texts when redistributing it.

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

Choose `ARCH=arm64` on AArch64. Checksums detect corruption; they are not a separate signing system. Verify the repository and HTTPS origin. See the [readme](../readme.md#run-locally) for private data-directory and transport settings before starting the application.

## Use a published image

Replace the owner/repository and version below with a release that actually exists:

```sh
IMAGE=ghcr.io/owner/repository
VERSION=1.1.0
docker pull "$IMAGE:$VERSION"
docker buildx imagetools inspect "$IMAGE:$VERSION"
```

Set `NEXA_IMAGE` in ignored `deploy/.env` to that version reference or the exact digest from `image-digest.txt`. Keep the HTTPS/origin/data settings from the [deployment guide](deployment.md). Pull and run without replacing the published image with a local rebuild:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml pull
docker compose --env-file deploy/.env -f deploy/compose.yaml \
  up --detach --no-build --pull always --wait
```

The manifest selects the host's Linux architecture automatically. Private packages require an appropriate registry login; never put credentials in Compose files, image URLs or public logs.

## Reruns and failure recovery

Use GitHub Actions' rerun controls or dispatch Release explicitly on the same immutable version tag:

```sh
VERSION=1.1.0
gh workflow run release.yaml --ref "v$VERSION"
```

A dispatch on a branch fails tag validation. A workflow file must be available to GitHub Actions, and the selected tag must contain the reviewed release configuration.

Publication to GHCR and GitHub Releases is not one atomic transaction. Failure/cancellation can leave staging tags, an unpublished pipeline-owned draft, or a version image/latest alias before the GitHub Release becomes public. Inspect the run and digests, retain the same tag/commit and rerun. The workflow can resume only its own draft for that commit, and never automatically deletes registry versions or a published release. If an artifact has expired or a prerequisite changed, rerun the complete verification instead of bypassing gates. A published release cannot be rerun as a replacement; prepare a new version.

Fix permissions/visibility in repository and package settings, not by adding long-lived tokens to source. Do not disable TLS checks or broaden the security exception to make a release pass. Environment reviewers, tag protections and repository access controls remain the operator's responsibility.
