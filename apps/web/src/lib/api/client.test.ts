import { expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { MutationObserver } from "@tanstack/react-query";
import { api, ApiError, queryClient, type ServiceInput } from "./client";
import { server, apiURL, denied } from "@/test/server";
import {
  bootstrap,
  categories,
  csrf,
  fixtureId,
  fixtureServices,
  stamp,
} from "@/test/fixtures";
import { serviceInput } from "@/lib/forms";

it("uses the synchronized CSRF token and strips response-only link fields", async () => {
  server.use(
    http.get(apiURL("/auth/me"), () =>
      HttpResponse.json({ username: "admin", csrfToken: csrf }),
    ),
    http.post(apiURL("/admin/services"), async ({ request }) => {
      expect(request.headers.get("X-CSRF-Token")).toBe(csrf);
      const body = (await request.json()) as ServiceInput;
      expect(body).not.toHaveProperty("id");
      expect(body.links[0]).not.toHaveProperty("id");
      return HttpResponse.json(
        {
          ...body,
          id: fixtureId(50),
          position: 0,
          createdAt: stamp,
          updatedAt: stamp,
          links: body.links.map((link) => ({ ...link, id: fixtureId(51) })),
        },
        { status: 201 },
      );
    }),
  );
  await api.me();
  const saved = await api.saveService(serviceInput(fixtureServices(1)[0]));
  expect(saved.id).toBe(fixtureId(50));
});

it("clears private query and mutation data when a protected request loses authentication", async () => {
  queryClient.setQueryData(["me"], { username: "admin", csrfToken: csrf });
  queryClient.setQueryData(["admin", "services"], bootstrap.services);
  queryClient.setQueryData(["bootstrap"], {
    ...bootstrap,
    settings: { ...bootstrap.settings, accessMode: "private" },
  });
  const mutation = new MutationObserver(queryClient, {
    mutationFn: async (input: { privateURL: string }) => input,
  });
  await mutation.mutate({ privateURL: "https://private.example.test" });
  server.use(http.get(apiURL("/admin/settings"), () => denied()));
  await expect(api.settings()).rejects.toMatchObject({
    status: 401,
    code: "UNAUTHENTICATED",
    requestId: "test-request",
  });
  expect(queryClient.getQueryData(["admin", "services"])).toBeUndefined();
  expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  expect(queryClient.getQueryData(["me"])).toBeNull();
  expect(queryClient.getQueryData(["bootstrap"])).toBeNull();
});

it("reports secure-cookie setup problems instead of looping after a successful login", async () => {
  server.use(
    http.post(apiURL("/auth/login"), () =>
      HttpResponse.json({ csrfToken: csrf }),
    ),
  );
  await expect(
    api.login("admin", "a strong test password"),
  ).rejects.toMatchObject({ code: "COOKIE_BLOCKED" });
});
it("keeps an authenticated form when only the current password is wrong", async () => {
  const me = { username: "admin", csrfToken: csrf };
  server.use(
    http.get(apiURL("/auth/me"), () => HttpResponse.json(me)),
    http.put(apiURL("/auth/password"), () => denied()),
  );
  queryClient.setQueryData(["me"], me);
  queryClient.setQueryData(["admin", "services"], bootstrap.services);
  await api.me();
  await expect(
    api.changePassword("incorrect password", "a replacement password"),
  ).rejects.toMatchObject({ status: 401 });
  expect(queryClient.getQueryData(["admin", "services"])).toEqual(
    bootstrap.services,
  );
  expect(queryClient.getQueryData(["me"])).toEqual(me);
});
it("clears an expired session on password rotation failure", async () => {
  queryClient.setQueryData(["me"], { username: "admin", csrfToken: csrf });
  queryClient.setQueryData(["admin", "services"], bootstrap.services);
  server.use(http.put(apiURL("/auth/password"), () => denied()));
  await expect(
    api.changePassword("old test password", "a replacement password"),
  ).rejects.toMatchObject({ status: 401 });
  expect(queryClient.getQueryData(["me"])).toBeNull();
  expect(queryClient.getQueryData(["admin", "services"])).toBeUndefined();
});
it("handles public/private bootstrap and invalid credential failures distinctly", async () => {
  server.use(
    http.get(apiURL("/public/bootstrap"), () => denied()),
    http.post(apiURL("/auth/login"), () => denied()),
  );
  expect(await api.bootstrap()).toBeNull();
  await expect(api.login("unknown", "wrong password")).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
  });
});
it("fetches all pages without omitting the hidden members needed for reordering", async () => {
  const services = fixtureServices(201);
  services[200]!.isVisible = false;
  server.use(
    http.get(apiURL("/admin/services"), ({ request }) => {
      const query = new URL(request.url).searchParams;
      expect(query.get("pageSize")).toBe("200");
      const page = Number(query.get("page"));
      return HttpResponse.json({
        items: services.slice((page - 1) * 200, page * 200),
        total: services.length,
        page,
        pageSize: 200,
      });
    }),
  );
  expect(await api.services()).toEqual(services);
});
it("rejects a changing pagination snapshot instead of silently losing items", async () => {
  const services = fixtureServices(201);
  server.use(
    http.get(apiURL("/admin/services"), ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get("page"));
      return HttpResponse.json({
        items: page === 1 ? services.slice(0, 200) : services.slice(200),
        total: page === 1 ? 201 : 202,
        page,
        pageSize: 200,
      });
    }),
  );
  await expect(api.services()).rejects.toMatchObject({ code: "CONFLICT" });
});
it("serializes a Blob upload as real multipart data", async () => {
  server.use(
    http.post(apiURL("/admin/assets"), async ({ request }) => {
      expect(request.headers.get("Content-Type")).toContain(
        "multipart/form-data; boundary=",
      );
      const form = await request.formData();
      const file = form.get("file");
      expect(file).not.toBeNull();
      if (file && typeof file !== "string") {
        expect(file.name).toBe("local.svg");
        expect(await file.text()).toBe("<svg/>");
      }
      return HttpResponse.json(
        {
          id: fixtureId(70),
          mimeType: "image/svg+xml",
          byteSize: 6,
          url: `/assets/${fixtureId(70)}`,
        },
        { status: 201 },
      );
    }),
  );
  const result = await api.upload(
    new File(["<svg/>"], "local.svg", { type: "image/svg+xml" }),
  );
  expect(result.mimeType).toBe("image/svg+xml");
});
it("uses the existing backup contract for the lazy icon library without keeping base64", async () => {
  const id = fixtureId(71);
  server.use(
    http.get(apiURL("/admin/backup/export"), () =>
      HttpResponse.json({
        format: "nexa-home-backup",
        version: 1,
        exportedAt: stamp,
        settings: bootstrap.settings,
        categories,
        services: [{ ...bootstrap.services[0], iconAssetId: id }],
        tags: bootstrap.tags,
        assets: [{ id, mimeType: "image/png", base64: "AAAAAA==" }],
      }),
    ),
  );
  const icons = await api.icons();
  expect(icons).toEqual([
    {
      id,
      mimeType: "image/png",
      byteSize: 4,
      url: `/assets/${id}`,
      inUse: true,
    },
  ]);
  expect(icons[0]).not.toHaveProperty("base64");
});
it("converts network failures to a stable retryable error", async () => {
  server.use(http.get(apiURL("/admin/settings"), () => HttpResponse.error()));
  await expect(api.settings()).rejects.toEqual(
    expect.objectContaining({ status: 0, code: "NETWORK_ERROR" }),
  );
  expect(new ApiError(409, "REVISION_CONFLICT")).toBeInstanceOf(Error);
});
it("clears authenticated state on a private-bootstrap 401 without refetching itself", async () => {
  queryClient.setQueryData(["me"], { username: "admin", csrfToken: csrf });
  queryClient.setQueryData(["admin", "services"], bootstrap.services);
  queryClient.setQueryData(["bootstrap"], {
    ...bootstrap,
    settings: { ...bootstrap.settings, accessMode: "private" },
  });
  let calls = 0;
  server.use(
    http.get(apiURL("/public/bootstrap"), () => {
      calls++;
      return denied();
    }),
  );
  expect(await api.bootstrap()).toBeNull();
  expect(queryClient.getQueryData(["me"])).toBeNull();
  expect(queryClient.getQueryData(["admin", "services"])).toBeUndefined();
  expect(queryClient.getQueryData(["bootstrap"])).toBeNull();
  expect(calls).toBe(1);
});
it("cancels late bootstrap results before they can repopulate private data after expiry", async () => {
  let release!: (value: typeof bootstrap) => void;
  let signal!: AbortSignal;
  const pending = new Promise<typeof bootstrap>((resolve) => {
    release = resolve;
  });
  const late = queryClient
    .fetchQuery({
      queryKey: ["bootstrap"],
      queryFn(context) {
        signal = context.signal;
        return pending;
      },
    })
    .catch(() => undefined);
  server.use(http.get(apiURL("/admin/settings"), () => denied()));
  await expect(api.settings()).rejects.toMatchObject({ status: 401 });
  expect(signal.aborted).toBe(true);
  release({
    ...bootstrap,
    settings: { ...bootstrap.settings, accessMode: "private" },
  });
  await late;
  expect(queryClient.getQueryData(["bootstrap"])).toBeNull();
});
it("does not treat explicitly aborted identity requests as network or authentication failures", async () => {
  queryClient.setQueryData(["me"], { username: "admin", csrfToken: csrf });
  const controller = new AbortController();
  controller.abort();
  await expect(api.me(controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(queryClient.getQueryData(["me"])).toEqual({
    username: "admin",
    csrfToken: csrf,
  });
});
