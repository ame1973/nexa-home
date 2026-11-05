ARG VERSION=1.0.0
ARG REVISION=unknown
ARG SOURCE=

FROM --platform=$BUILDPLATFORM node:24.14.1-alpine@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS web-build
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --no-audit --no-fund
COPY apps/web/ apps/web/
COPY api/icons.json api/icons.json
COPY scripts/sonner-csp.mjs scripts/sonner-csp.mjs
RUN npm run build:web

FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine@sha256:d200d2dd76b03a99b52651fd1325aff7dcd35422c35c01bac56571b0507f3deb AS go-build
WORKDIR /src
ENV GOTOOLCHAIN=local
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY api/ api/
COPY cmd/ cmd/
COPY db/ db/
COPY internal/ internal/
COPY --from=web-build /src/internal/web/dist/ internal/web/dist/
ARG TARGETOS
ARG TARGETARCH
ARG VERSION
# Preserve symbols so binary reachability scans do not fall back to module-only guesses.
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-X main.version=${VERSION}" -o /out/nexa-home ./cmd/nexa-home
RUN mkdir -p /out/data /out/tmp

# No shell, package manager, Node, compiler, or outbound-fetch helper is shipped.
FROM scratch
ARG VERSION
ARG REVISION
ARG SOURCE
LABEL org.opencontainers.image.title="Nexa Home" \
      org.opencontainers.image.description="A private, self-hosted service launcher" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.source="${SOURCE}" \
      org.opencontainers.image.licenses="MIT"
COPY --from=go-build --chmod=0555 /out/nexa-home /nexa-home
COPY --from=go-build --chown=10001:10001 --chmod=0700 /out/data /data
COPY --from=go-build --chmod=1777 /out/tmp /tmp
COPY LICENSE THIRD_PARTY_NOTICES.md /usr/share/licenses/nexa-home/
USER 10001:10001
ENV NEXA_LISTEN=0.0.0.0:8080 NEXA_DATA_DIR=/data TZ=UTC
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/nexa-home", "healthcheck"]
ENTRYPOINT ["/nexa-home"]
CMD ["serve"]
