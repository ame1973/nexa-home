import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Agent } from "undici";

const image = process.env.NEXA_TEST_IMAGE || "nexa-home:1.0.0";
const platform =
  process.env.NEXA_TEST_PLATFORM ||
  `linux/${process.arch === "arm64" ? "arm64" : "amd64"}`;
assert.ok(["linux/amd64", "linux/arm64"].includes(platform));
const composeFile = process.env.NEXA_TEST_COMPOSE_FILE || "deploy/compose.yaml";
assert.ok(
  ["deploy/compose.yaml", "compose.yaml"].includes(composeFile),
  "Only reviewed Compose files may create and clean up fixture resources",
);
const qemu = process.env.NEXA_TEST_QEMU;
if (qemu)
  assert.ok(
    isAbsolute(qemu),
    "The optional user-mode emulator must be an absolute path",
  );

// Docker output can contain a first-run credential. Keep it in memory and never
// attach raw stdout/stderr to assertion errors, reports, or child-process errors.
function docker(args, { allowFailure = false, env = process.env } = {}) {
  const result = spawnSync("docker", args, {
    env,
    encoding: "utf8",
    timeout: 90_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (!allowFailure && (result.error || result.status !== 0)) {
    const diagnostic = (result.stderr || "")
      .split("\n")
      .filter((line) => !line.includes("setupToken"))
      .join("\n")
      .replace(/[A-Za-z0-9_-]{43,}/g, "[redacted]")
      .slice(-2000);
    throw new Error(
      `Docker ${args[0]} failed (exit ${result.status ?? "unavailable"}): ${diagnostic}`,
    );
  }
  return result;
}

function startupToken(container) {
  const output = docker(["logs", container]);
  let token = "";
  for (const line of `${output.stdout}\n${output.stderr}`.split("\n")) {
    try {
      const event = JSON.parse(line);
      if (typeof event.setupToken === "string") token = event.setupToken;
    } catch {
      /* Docker may add non-JSON diagnostics. */
    }
  }
  return token;
}

test(
  `real ${platform} Compose image (${composeFile}): security, backup, restart and persistence${qemu ? " (unprivileged user-mode emulation)" : ""}`,
  { timeout: 240_000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "nexa-container-"));
    const project = `nexa-test-${randomUUID()}`;
    const contender = `${project}-contender`;
    const doctor = `${project}-doctor`;
    const proxy = `${project}-tls`;
    let tlsAgent;
    const override = join(directory, "override.yaml");
    const entrypoint = qemu ? ["/nexa-qemu", "/nexa-home"] : ["/nexa-home"];
    const service = {
      platform,
      pull_policy: "never",
      ...(qemu
        ? {
            entrypoint,
            volumes: [
              {
                type: "bind",
                source: qemu,
                target: "/nexa-qemu",
                read_only: true,
              },
            ],
          }
        : {}),
      healthcheck: {
        test: ["CMD", ...entrypoint, "healthcheck"],
        interval: "1s",
        start_period: "1s",
      },
    };
    // Reset build explicitly: Compose run can otherwise rebuild a multiarch tag
    // after inspecting only the daemon's native default platform. JSON values
    // are also valid YAML and safely quote the optional emulator path.
    const configuration = () =>
      "services:\n  nexa-home:\n    build: !reset null\n" +
      Object.entries(service)
        .map(([key, value]) => `    ${key}: ${JSON.stringify(value)}\n`)
        .join("");
    await writeFile(override, configuration());
    const selected = JSON.parse(
      docker(["image", "inspect", "--platform", platform, image]).stdout,
    )[0];
    assert.equal(`${selected.Os}/${selected.Architecture}`, platform);
    const env = {
      ...process.env,
      NEXA_IMAGE: image,
      NEXA_HOST_BIND: "127.0.0.1",
      NEXA_HOST_PORT: "0",
      NEXA_PUBLIC_ORIGIN: "",
      NEXA_TRUSTED_PROXY_CIDRS: "",
      NEXA_ALLOW_HTTP_COOKIE: "true",
      NEXA_LOG_LEVEL: "info",
    };
    const compose = (args, options) =>
      docker(
        [
          "compose",
          "--env-file",
          "/dev/null",
          "--project-name",
          project,
          "--file",
          resolve(composeFile),
          "--file",
          override,
          ...args,
        ],
        { env, ...options },
      );
    let container = "";
    let url = "";
    let cookie = "";
    let csrf = "";
    async function api(path, { method = "GET", data, status = 200 } = {}) {
      const response = await fetch(`${url}/api/v1${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        dispatcher: tlsAgent,
        headers: {
          Origin: url,
          Cookie: cookie,
          "X-CSRF-Token": csrf,
          ...(data instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
        },
        body:
          data instanceof FormData
            ? data
            : data === undefined
              ? undefined
              : JSON.stringify(data),
      });
      assert.equal(response.status, status, `${method} ${path} status`);
      if (path === "/auth/login") {
        const sessionCookie = response.headers.getSetCookie()[0] || "";
        if (tlsAgent)
          assert.ok(
            /;\s*Secure(?:;|$)/.test(sessionCookie),
            "HTTPS login sets a Secure cookie",
          );
        cookie = sessionCookie.split(";")[0];
      }
      return status === 204 ? undefined : response.json();
    }
    function start() {
      compose([
        "up",
        "--detach",
        "--no-build",
        "--pull",
        "never",
        "--wait",
        "--wait-timeout",
        "60",
      ]);
      container = compose(["ps", "--quiet", "nexa-home"]).stdout.trim();
      assert.ok(container, "The test project has a container");
      const port = compose(["port", "nexa-home", "8080"]).stdout.trim();
      assert.ok(
        /^127\.0\.0\.1:\d+$/.test(port),
        "Only a loopback test port is published",
      );
      url = `http://${port}`;
      const state = JSON.parse(docker(["inspect", container]).stdout)[0];
      assert.equal(state.State.Health.Status, "healthy");
      assert.equal(state.Config.User, "10001:10001");
      assert.equal(state.HostConfig.ReadonlyRootfs, true);
      assert.equal(state.HostConfig.Privileged, false);
      assert.deepEqual(state.HostConfig.CapDrop, ["ALL"]);
      assert.ok(
        state.HostConfig.SecurityOpt.includes("no-new-privileges:true"),
      );
      assert.equal(state.HostConfig.PidsLimit, 128);
      assert.equal(state.HostConfig.Memory, 512 * 1024 * 1024);
      assert.equal(state.HostConfig.RestartPolicy.Name, "unless-stopped");
      assert.ok(state.HostConfig.Tmpfs["/tmp"].includes("noexec"));
      const dataMount = state.Mounts.find(
        (mount) =>
          mount.Destination === "/data" && mount.Type === "volume" && mount.RW,
      );
      assert.ok(dataMount, "Persistent data is a writable named volume");
      docker(["exec", container, ...entrypoint, "healthcheck"]);
      assert.equal(
        docker(["exec", container, "node", "--version"], { allowFailure: true })
          .status,
        127,
      );
      assert.equal(
        docker(["exec", container, "/bin/sh", "-c", "true"], {
          allowFailure: true,
        }).status,
        127,
      );
    }
    function stop() {
      compose(["stop", "nexa-home"]);
      const state = JSON.parse(docker(["inspect", container]).stdout)[0];
      assert.equal(state.State.ExitCode, 0, "SIGTERM drains and exits cleanly");
      assert.equal(state.State.OOMKilled, false);
    }
    try {
      start();
      const token = startupToken(container);
      assert.ok(
        /^[A-Za-z0-9_-]{43}$/.test(token),
        "The owned test instance issued a setup credential",
      );
      const credentials = {
        username: "container-owner",
        password: "Only used by the isolated container test",
      };
      await api("/setup", {
        method: "POST",
        data: { token, ...credentials },
        status: 201,
      });
      csrf = (await api("/auth/login", { method: "POST", data: credentials }))
        .csrfToken;
      assert.ok(cookie && csrf, "Session credentials remain in process memory");

      const form = new FormData();
      form.append(
        "file",
        new Blob(
          [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4 L20 4 L20 20 Z" fill="#8b9fff"/></svg>',
          ],
          { type: "image/svg+xml" },
        ),
        "local.svg",
      );
      const asset = await api("/admin/assets", {
        method: "POST",
        data: form,
        status: 201,
      });
      const category = await api("/admin/categories", {
        method: "POST",
        data: {
          name: "Container services",
          description: "",
          icon: "server",
          isVisible: true,
        },
        status: 201,
      });
      const serviceInput = {
        name: "Persistent service",
        description: "Synthetic deployment test",
        categoryId: category.id,
        iconKind: "asset",
        iconValue: "Local icon",
        iconAssetId: asset.id,
        color: "#405B82",
        openMode: "new_tab",
        isFavorite: true,
        isVisible: true,
        tagIds: [],
        links: [{ label: "primary", url: "https://service.example.test" }],
      };
      const service = await api("/admin/services", {
        method: "POST",
        data: serviceInput,
        status: 201,
      });
      await api(`/admin/services/${service.id}`, {
        method: "PUT",
        data: { ...serviceInput, description: "Edited in the real container" },
      });
      const currentSettings = await api("/admin/settings");
      const { revision, updatedAt: _updatedAt, ...fields } = currentSettings;
      const customTheme = {
        schemaVersion: 1,
        name: "Container Tide",
        variants: {
          light: {
            background: "#f0f7f8",
            surface: "#ffffff",
            accent: "#006c73",
          },
          dark: {
            background: "#0c1b22",
            surface: "#132d38",
            accent: "#6bd3cc",
          },
        },
        radius: 12,
        shadow: "none",
      };
      const customCSS =
        "@layer custom { .service-tile { border-style: dashed !important; } }";
      await api("/admin/settings", {
        method: "PUT",
        data: {
          ...fields,
          expectedRevision: revision,
          themePreset: "custom",
          customTheme,
          customCSS,
        },
      });
      const exported = await api("/admin/backup/export?includeAssets=true");
      assert.equal(exported.version, 3);
      assert.equal(exported.settings.themePreset, "custom");
      assert.deepEqual(exported.settings.customTheme, customTheme);
      assert.equal(exported.settings.customCSS, customCSS);
      assert.equal(exported.services.length, 1);
      assert.equal(exported.assets.length, 1);
      assert.ok(
        !JSON.stringify(exported).includes(credentials.password),
        "Portable export excludes credentials",
      );
      const preview = await api("/admin/backup/validate", {
        method: "POST",
        data: exported,
      });
      await api("/admin/backup/commit", {
        method: "POST",
        data: { importToken: preview.importToken, replace: true },
      });
      assert.equal((await api("/public/bootstrap")).services[0].id, service.id);
      const icon = await fetch(`${url}${asset.url}`);
      assert.equal(icon.status, 200);
      assert.equal(icon.headers.get("content-type"), "image/svg+xml");
      await icon.arrayBuffer();
      const html = await fetch(url);
      assert.equal(html.status, 200);
      assert.ok(
        html.headers
          .get("content-security-policy")
          .includes("script-src 'self'"),
      );
      assert.ok(
        (await html.text()).includes("/static/"),
        "The image serves the embedded production SPA",
      );

      const rejected = compose(
        ["run", "--rm", "--no-deps", "--name", contender, "nexa-home", "serve"],
        { allowFailure: true },
      );
      assert.equal(
        rejected.status,
        1,
        "A second writer cannot open the shared data volume",
      );
      assert.ok(
        rejected.stderr.includes("already owned"),
        "The competing writer is rejected before SQLite opens",
      );

      docker(["export", "--output", join(directory, "rootfs.tar"), container]);
      const listing = spawnSync("tar", ["-tf", join(directory, "rootfs.tar")], {
        encoding: "utf8",
      });
      assert.equal(listing.status, 0);
      assert.ok(
        !/(^|\/)(node|npm|node_modules|sh|bash)(\/|$)/m.test(listing.stdout),
        "The exported runtime has no Node or shell",
      );

      stop();
      compose(["rm", "--force", "nexa-home"]);
      start(); // A new container, not just a process restart, reuses only the named volume.
      assert.equal(
        startupToken(container),
        "",
        "Initialized data never issues a new setup token",
      );
      assert.equal(
        (await api("/auth/me")).username,
        credentials.username,
        "The pre-restart session remains valid",
      );
      const persisted = await api("/admin/backup/export?includeAssets=true");
      assert.deepEqual(
        persisted.services,
        (await api("/public/bootstrap")).services,
      );
      assert.equal(persisted.services[0].id, service.id);
      assert.equal(
        persisted.services[0].description,
        "Edited in the real container",
      );
      assert.deepEqual(persisted.assets, exported.assets);
      for (const key of ["themePreset", "customTheme", "customCSS"]) {
        assert.deepEqual(
          persisted.settings[key],
          exported.settings[key],
          `Replacement preserves ${key}`,
        );
      }
      assert.equal((await fetch(`${url}${asset.url}`)).status, 200);
      stop();
      const archived = spawnSync(
        "docker",
        ["cp", "--archive", `${container}:/data/.`, "-"],
        {
          timeout: 30_000,
          maxBuffer: 64 * 1024 * 1024,
        },
      );
      assert.equal(
        archived.status,
        0,
        "A stopped complete data directory can be archived",
      );
      const archivePath = join(directory, "stopped-data.tar");
      await writeFile(archivePath, archived.stdout, { mode: 0o600 });
      compose(["rm", "--force", "nexa-home"]);
      // Both volumes stay declared in this unique project's configuration, so
      // Compose alone owns cleanup; no inspected or query-selected volume is deleted.
      service.volumes = [
        ...(service.volumes || []),
        {
          type: "volume",
          source: "recovered_data",
          target: "/data",
        },
      ];
      await writeFile(
        override,
        configuration() + "volumes:\n  recovered_data: {}\n",
      );
      compose(["create", "--no-build", "--pull", "never", "nexa-home"]);
      container = compose([
        "ps",
        "--all",
        "--quiet",
        "nexa-home",
      ]).stdout.trim();
      assert.ok(container, "Recovery creates a separate stopped container");
      const copied = spawnSync(
        "docker",
        ["cp", "--archive", "-", `${container}:/data`],
        {
          input: await readFile(archivePath),
          timeout: 30_000,
          maxBuffer: 64 * 1024 * 1024,
        },
      );
      assert.equal(
        copied.status,
        0,
        "Archive restore preserves UID and private file modes",
      );
      start();
      assert.equal(
        startupToken(container),
        "",
        "Cold restore preserves initialization",
      );
      assert.equal((await api("/auth/me")).username, credentials.username);
      const recovered = await api("/admin/backup/export?includeAssets=true");
      for (const key of [
        "settings",
        "categories",
        "tags",
        "services",
        "assets",
      ])
        assert.deepEqual(
          recovered[key],
          persisted[key],
          `Cold restore preserves ${key}`,
        );
      await api(`/admin/services/${service.id}`, {
        method: "DELETE",
        status: 204,
      });
      assert.equal((await api("/public/bootstrap")).services.length, 0);

      // Exercise the shipped proxy example with a per-test trusted certificate.
      // No system CA store changes or TLS verification bypass are used.
      const tlsDirectory = await mkdtemp(join(directory, "tls-"));
      const generated = spawnSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-days",
          "1",
          "-subj",
          "/CN=localhost",
          "-addext",
          "subjectAltName=DNS:localhost,IP:127.0.0.1",
          "-keyout",
          join(tlsDirectory, "privkey.pem"),
          "-out",
          join(tlsDirectory, "fullchain.pem"),
        ],
        { timeout: 30_000 },
      );
      assert.equal(
        generated.status,
        0,
        "A private test certificate can be created",
      );
      const site = (await readFile("deploy/nginx.conf.example", "utf8"))
        .replace("listen 443 ssl;", "listen 8443 ssl;")
        .replace("server_name home.example.com;", "server_name localhost;")
        .replace("http://127.0.0.1:8080", "http://nexa-home:8080");
      const proxyConfig = join(directory, "nginx.conf");
      await writeFile(
        proxyConfig,
        `pid /tmp/nginx.pid;\nerror_log /dev/stderr warn;\nevents { worker_connections 128; }\nhttp {\nclient_body_temp_path /tmp/client;\nproxy_temp_path /tmp/proxy;\nfastcgi_temp_path /tmp/fastcgi;\nuwsgi_temp_path /tmp/uwsgi;\nscgi_temp_path /tmp/scgi;\n${site}\n}\n`,
        { mode: 0o600 },
      );
      docker([
        "run",
        "--detach",
        "--name",
        proxy,
        "--network",
        `${project}_default`,
        "--user",
        `${process.getuid()}:${process.getgid()}`,
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges:true",
        "--tmpfs",
        "/tmp:rw,size=16m,noexec,nosuid,nodev",
        "--publish",
        "127.0.0.1::8443",
        "--mount",
        `type=bind,src=${tlsDirectory},dst=/etc/nginx/tls,readonly`,
        "--mount",
        `type=bind,src=${proxyConfig},dst=/etc/nginx/nginx.conf,readonly`,
        "--entrypoint",
        "nginx",
        "nginx:1.30.6-alpine@sha256:0e52bd054126cdc040b1276c0af347aeb02a41b9cfe305d6094767ac30e97949",
        "-g",
        "daemon off;",
      ]);
      const proxyAddress = docker(["port", proxy, "8443"]).stdout.trim();
      assert.ok(
        /^127\.0\.0\.1:\d+$/.test(proxyAddress),
        "TLS proxy is loopback-only",
      );
      const secureOrigin = `https://${proxyAddress}`;
      const proxyIP = JSON.parse(docker(["inspect", proxy]).stdout)[0]
        .NetworkSettings.Networks[`${project}_default`].IPAddress;
      stop();
      env.NEXA_PUBLIC_ORIGIN = secureOrigin;
      env.NEXA_ALLOW_HTTP_COOKIE = "false";
      env.NEXA_TRUSTED_PROXY_CIDRS = `${proxyIP}/32`;
      start();
      docker(["exec", proxy, "nginx", "-s", "reload"]);
      tlsAgent = new Agent({
        connect: { ca: await readFile(join(tlsDirectory, "fullchain.pem")) },
      });
      let ready = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          const response = await fetch(`${secureOrigin}/readyz`, {
            dispatcher: tlsAgent,
            signal: AbortSignal.timeout(2000),
          });
          ready = response.status === 200;
          await response.body.cancel();
          if (ready) break;
        } catch {
          /* Wait only for this owned proxy's real readiness. */
        }
        await delay(100);
      }
      assert.ok(
        ready,
        "Trusted TLS readiness succeeds with certificate verification enabled",
      );
      await assert.rejects(
        fetch(`${secureOrigin}/healthz`, { signal: AbortSignal.timeout(5000) }),
        (error) => error.cause?.code === "DEPTH_ZERO_SELF_SIGNED_CERT",
        "The same certificate is rejected without the explicit test CA",
      );
      url = secureOrigin;
      csrf = (await api("/auth/login", { method: "POST", data: credentials }))
        .csrfToken;
      assert.equal((await api("/auth/me")).username, credentials.username);
      const secureTag = await api("/admin/tags", {
        method: "POST",
        data: { name: "TLS verified" },
        status: 201,
      });
      await api(`/admin/tags/${secureTag.id}`, {
        method: "DELETE",
        status: 204,
      });
      const forged = await fetch(`${url}/api/v1/admin/tags`, {
        method: "POST",
        dispatcher: tlsAgent,
        signal: AbortSignal.timeout(5000),
        headers: {
          Origin: "https://attacker.example",
          Cookie: cookie,
          "X-CSRF-Token": csrf,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Must not be created" }),
      });
      assert.equal(
        forged.status,
        403,
        "The real HTTPS proxy does not bypass exact Origin checks",
      );
      await forged.body.cancel();
      const securePage = await fetch(url, { dispatcher: tlsAgent });
      assert.equal(securePage.status, 200);
      assert.equal(
        securePage.headers.get("strict-transport-security"),
        "max-age=31536000",
      );
      assert.ok(
        securePage.headers
          .get("content-security-policy")
          .includes("script-src 'self'"),
      );
      await securePage.body.cancel();
      await tlsAgent.close();
      tlsAgent = undefined;
      stop();
      compose([
        "run",
        "--rm",
        "--no-deps",
        "--name",
        doctor,
        "nexa-home",
        "doctor",
      ]);
      assert.equal(
        JSON.parse(
          docker(["image", "inspect", "--platform", platform, image]).stdout,
        )[0].Id,
        selected.Id,
        "The deployment test never rebuilds or replaces the selected image",
      );
      t.diagnostic(
        "Real setup/login, icon and catalog CRUD, portable restore, health, replacement-container persistence, cold archive recovery to a fresh volume, verified HTTPS/Secure cookies/Origin boundaries, retained session, exclusive lock and offline doctor passed; no credentials captured.",
      );
    } finally {
      // Only this random, session-created project and its explicitly named helpers.
      try {
        await tlsAgent?.close();
      } finally {
        docker(["rm", "--force", contender, doctor, proxy], {
          allowFailure: true,
        });
        compose(["down", "--volumes", "--timeout", "40"]);
        await rm(directory, { recursive: true, force: true });
      }
    }
  },
);

test(
  `real ${platform} registry roundtrip preserves release index annotations and immutable digests`,
  { timeout: 120_000 },
  async (t) => {
    const selected = JSON.parse(
      docker(["image", "inspect", "--platform", platform, image]).stdout,
    )[0];
    const annotations = Object.fromEntries(
      ["version", "revision", "source"].map((key) => {
        const name = `org.opencontainers.image.${key}`;
        const value = selected.Config.Labels?.[name];
        assert.equal(typeof value, "string", name);
        return [name, value];
      }),
    );
    const directory = await mkdtemp(join(tmpdir(), "nexa-registry-"));
    let registry = "";
    let staging = "";
    t.after(async () => {
      try {
        if (staging) docker(["image", "rm", staging], { allowFailure: true });
      } finally {
        if (registry) docker(["rm", "--force", registry]);
        await rm(directory, { recursive: true, force: true });
      }
    });
    // Both the daemon push and the socket-free Buildx client use the daemon's
    // loopback namespace, including when the daemon runs in Docker Desktop's VM.
    const buildx = (args) =>
      docker([
        "run",
        "--rm",
        "--network",
        "host",
        "--user",
        `${process.getuid()}:${process.getgid()}`,
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges:true",
        "--env",
        "HOME=/tmp",
        "--tmpfs",
        "/tmp:rw,size=16m,noexec,nosuid,nodev",
        "--mount",
        `type=bind,src=${directory},dst=/output`,
        "--entrypoint",
        "/buildx",
        "docker/buildx-bin:0.38.2@sha256:1fb51a05e9455e21396698b774446ff80d80fd53f17079d82aaee9c195f962f9",
        ...args.map((value) =>
          value.startsWith(`${directory}/`)
            ? `/output/${value.slice(directory.length + 1)}`
            : value,
        ),
      ]);
    registry = docker([
      "create",
      "--network",
      "host",
      "--user",
      "10001:10001",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges:true",
      "--tmpfs",
      "/var/lib/registry:rw,size=256m,noexec,nosuid,nodev,mode=0700,uid=10001,gid=10001",
      "--env",
      "REGISTRY_HTTP_ADDR=127.0.0.1:0",
      "registry:3.0.0@sha256:6c5666b861f3505b116bb9aa9b25175e71210414bd010d92035ff64018f9457e",
    ]).stdout.trim();
    assert.match(registry, /^[0-9a-f]{64}$/);
    docker(["start", registry]);
    let address = "";
    for (let attempt = 0; attempt < 50; attempt++) {
      const logs = docker(["logs", registry]);
      address =
        `${logs.stdout}\n${logs.stderr}`.match(
          /listening on (127\.0\.0\.1:\d+)/,
        )?.[1] || "";
      if (address) break;
      await delay(100);
    }
    assert.match(
      address,
      /^127\.0\.0\.1:\d+$/,
      "The registry must listen only on an assigned loopback port",
    );
    const repository = `${address}/nexa-${randomUUID()}`;
    staging = `${repository}:runtime`;
    docker(["image", "tag", image, staging]);
    const archive = join(directory, "image.tar");
    docker([
      "image",
      "save",
      "--platform",
      platform,
      "--output",
      archive,
      staging,
    ]);
    docker(["image", "rm", staging]);
    docker(["image", "load", "--input", archive]);
    docker(["image", "push", staging]);
    const references = JSON.parse(
      docker([
        "image",
        "inspect",
        "--platform",
        platform,
        "--format",
        "{{json .RepoDigests}}",
        staging,
      ]).stdout,
    ).filter((reference) => reference.startsWith(`${repository}@`));
    assert.equal(references.length, 1);
    const runtime = JSON.parse(
      buildx(["imagetools", "inspect", "--raw", references[0]]).stdout,
    );
    const expected = runtime.manifests
      ? runtime.manifests.find(
          (entry) =>
            `${entry.platform?.os}/${entry.platform?.architecture}` ===
            platform,
        ).digest
      : references[0].split("@")[1];
    const published = join(directory, "published.json");
    buildx([
      "imagetools",
      "create",
      "--metadata-file",
      published,
      ...Object.entries(annotations).flatMap(([key, value]) => [
        "--annotation",
        `index:${key}=${value}`,
      ]),
      "--tag",
      `${repository}:version`,
      references[0],
    ]);
    const digest = JSON.parse(await readFile(published, "utf8"))[
      "containerimage.descriptor"
    ].digest;
    const immutable = `${repository}@${digest}`;
    const index = JSON.parse(
      buildx(["imagetools", "inspect", "--raw", immutable]).stdout,
    );
    assert.deepEqual(
      index.annotations,
      annotations,
      "OCI release annotations must survive actual save/load/push and index creation",
    );
    assert.equal(index.mediaType, "application/vnd.oci.image.index.v1+json");
    const runtimeEntries = index.manifests.filter(
      (entry) => entry.platform?.os !== "unknown",
    );
    assert.equal(runtimeEntries.length, 1);
    assert.equal(
      `${runtimeEntries[0].platform.os}/${runtimeEntries[0].platform.architecture}`,
      platform,
    );
    assert.equal(
      runtimeEntries[0].digest,
      expected,
      "Index creation must not change the tested runtime manifest",
    );
    const promoted = join(directory, "latest.json");
    buildx([
      "imagetools",
      "create",
      "--metadata-file",
      promoted,
      "--tag",
      `${repository}:latest`,
      immutable,
    ]);
    assert.equal(
      JSON.parse(await readFile(promoted, "utf8"))["containerimage.descriptor"]
        .digest,
      digest,
      "Latest promotion must copy the exact annotated version index",
    );
    t.diagnostic(
      "Only a loopback, credential-free registry was written; version annotations, runtime digest and exact latest promotion passed.",
    );
  },
);
