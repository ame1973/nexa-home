#!/bin/sh
set -eu
umask 077
cd "$(dirname "$0")/.."

case "${NEXA_TEST_PLATFORM:-$(uname -m)}" in
  linux/amd64|x86_64) arch=amd64 ;;
  linux/arm64|aarch64|arm64) arch=arm64 ;;
  *) printf '%s\n' 'Only linux/amd64 and linux/arm64 are supported.' >&2; exit 1 ;;
esac
image=${NEXA_TEST_IMAGE:-nexa-home:1.0.0}
platform="linux/$arch"
mkdir -p .local/security/images .local/security/reports .local/security/trivy-cache
# Save only the selected immutable child, never publish the image or expose the
# daemon socket to the scanner. The mounted archive contains no application data.
docker image save --platform "$platform" \
  --output ".local/security/images/nexa-$arch.tar" "$image"
# The reviewed exception is conditional and scope/expiry tested. Preserve its
# record with --show-suppressed; every other finding still fails the gate.
docker run --rm --user "$(id -u):$(id -g)" --read-only --cap-drop=ALL \
  --security-opt=no-new-privileges:true \
  --tmpfs /tmp:rw,size=2g,noexec,nosuid,nodev \
  --mount "type=bind,src=$PWD/.local/security/images,dst=/images,readonly" \
  --mount "type=bind,src=$PWD/.local/security/reports,dst=/reports" \
  --mount "type=bind,src=$PWD/.local/security/trivy-cache,dst=/cache" \
  --mount "type=bind,src=$PWD/.trivyignore.yaml,dst=/policy/ignore.yaml,readonly" \
  aquasec/trivy:0.76.1@sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c \
  image --input "/images/nexa-$arch.tar" --cache-dir /cache \
  --scanners vuln --ignorefile /policy/ignore.yaml --show-suppressed \
  --format json --output "/reports/trivy-$arch.json" --exit-code 1
