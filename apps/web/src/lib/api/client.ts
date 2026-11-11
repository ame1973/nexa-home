import createClient from "openapi-fetch";
import { QueryClient } from "@tanstack/react-query";
import type { components, paths } from "./schema";

export type Settings = components["schemas"]["Settings"];
export type SettingsInput = components["schemas"]["SettingsUpdate"];
export type Category = components["schemas"]["Category"];
export type CategoryInput = components["schemas"]["CategoryInput"];
export type Service = components["schemas"]["Service"];
export type ServiceInput = components["schemas"]["ServiceInput"];
export type HealthStatus = components["schemas"]["HealthStatus"];
export type Tag = components["schemas"]["Tag"];
export type Asset = components["schemas"]["Asset"];
export type Backup = components["schemas"]["Backup"];
export type Bootstrap =
  paths["/api/v1/public/bootstrap"]["get"]["responses"][200]["content"]["application/json"];
export type Me =
  paths["/api/v1/auth/me"]["get"]["responses"][200]["content"]["application/json"];
type Envelope = components["schemas"]["Error"];

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details: Record<string, unknown> = {},
    public requestId = "",
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (attempt, error) =>
        attempt < 1 && (!(error instanceof ApiError) || error.status >= 500),
    },
    mutations: { retry: false },
  },
});
let csrfToken = "";
function expireSession(refreshBootstrap: boolean) {
  if (csrfToken || queryClient.getQueryData(["me"]))
    queryClient.setQueryData(["session-expired"], true);
  csrfToken = "";
  void queryClient.cancelQueries({
    predicate: (query) =>
      query.queryKey[0] === "me" ||
      query.queryKey[0] === "admin" ||
      query.queryKey[0] === "health" ||
      (refreshBootstrap && query.queryKey[0] === "bootstrap"),
  });
  queryClient.setQueryData(["me"], null);
  queryClient.removeQueries({ queryKey: ["admin"] });
  queryClient.removeQueries({ queryKey: ["health"] });
  queryClient.getMutationCache().clear();
  queryClient.setQueryData(["bootstrap"], null);
  if (refreshBootstrap)
    void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
}
const client = createClient<paths>({
  baseUrl: window.location.origin,
  credentials: "same-origin",
  fetch(request) {
    const timeout = request.url.includes("/backup/commit") ? 300_000 : 30_000;
    return fetch(request, {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeout)]),
    });
  },
});
client.use({
  onResponse({ request, response }) {
    const path = new URL(request.url).pathname;
    if (
      response.status === 401 &&
      path !== "/api/v1/auth/login" &&
      path !== "/api/v1/auth/me" &&
      path !== "/api/v1/auth/password" &&
      path !== "/api/v1/public/bootstrap"
    ) {
      expireSession(true);
    }
    return response;
  },
  onRequest({ request }) {
    if (request.method !== "GET" && csrfToken)
      request.headers.set("X-CSRF-Token", csrfToken);
    return request;
  },
});

async function take<T>(
  request: Promise<{ data?: T; error?: Envelope; response: Response }>,
): Promise<T> {
  try {
    const result = await request;
    if (!result.response.ok) {
      const error = result.error?.error;
      throw new ApiError(
        result.response.status,
        error?.code ?? "INTERNAL_ERROR",
        error?.details ?? {},
        error?.requestId ?? result.response.headers.get("X-Request-ID") ?? "",
      );
    }
    if (result.response.status !== 204 && result.data === undefined)
      throw new ApiError(500, "INTERNAL_ERROR");
    // A 204 has no data; the generated return type preserves that distinction.
    return result.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(0, "NETWORK_ERROR");
  }
}

export async function clearSession() {
  csrfToken = "";
  await queryClient.cancelQueries();
  queryClient.removeQueries({ queryKey: ["admin"] });
  queryClient.removeQueries({ queryKey: ["health"] });
  queryClient.getMutationCache().clear();
  queryClient.setQueryData(["session-expired"], false);
  queryClient.setQueryData(["me"], null);
  queryClient.setQueryData(["bootstrap"], null);
  await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
}

export const api = {
  setupStatus: () => take(client.GET("/api/v1/setup/status")),
  setup: (
    body: paths["/api/v1/setup"]["post"]["requestBody"]["content"]["application/json"],
  ) => take(client.POST("/api/v1/setup", { body })),
  async login(username: string, password: string) {
    const result = await take(
      client.POST("/api/v1/auth/login", { body: { username, password } }),
    );
    csrfToken = result.csrfToken;
    const me = await api.me();
    if (me === null) {
      queryClient.setQueryData(["session-expired"], false);
      throw new ApiError(401, "COOKIE_BLOCKED");
    }
    queryClient.setQueryData(["session-expired"], false);
    queryClient.setQueryData(["me"], me);
    await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    return me;
  },
  async me(signal?: AbortSignal): Promise<Me | null> {
    try {
      const value = await take(client.GET("/api/v1/auth/me", { signal }));
      if (signal?.aborted)
        throw new DOMException("Request aborted", "AbortError");
      csrfToken = value.csrfToken;
      return value;
    } catch (error) {
      if (signal?.aborted)
        throw new DOMException("Request aborted", "AbortError");
      if (error instanceof ApiError && error.status === 401) {
        if (csrfToken || queryClient.getQueryData(["me"])) expireSession(true);
        csrfToken = "";
        return null;
      }
      throw error;
    }
  },
  async logout() {
    try {
      await take(
        client.POST("/api/v1/auth/logout", {
          params: { header: { "X-CSRF-Token": csrfToken } },
        }),
      );
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
    }
    await clearSession();
  },
  async changePassword(currentPassword: string, newPassword: string) {
    try {
      await take(
        client.PUT("/api/v1/auth/password", {
          params: { header: { "X-CSRF-Token": csrfToken } },
          body: { currentPassword, newPassword },
        }),
      );
    } catch (error) {
      // A wrong current password and an expired cookie both use 401. Verify the
      // session before discarding private form state or treating it as expiry.
      if (
        error instanceof ApiError &&
        error.status === 401 &&
        (await api.me()) === null
      )
        expireSession(true);
      throw error;
    }
    await clearSession();
  },
  async bootstrap(signal?: AbortSignal): Promise<Bootstrap | null> {
    try {
      return await take(client.GET("/api/v1/public/bootstrap", { signal }));
    } catch (error) {
      if (signal?.aborted)
        throw new DOMException("Request aborted", "AbortError");
      if (error instanceof ApiError && error.status === 401) {
        expireSession(false);
        return null;
      }
      throw error;
    }
  },
  health: (signal?: AbortSignal) =>
    take(client.GET("/api/v1/public/health", { signal })),
  settings: () => take(client.GET("/api/v1/admin/settings")),
  saveSettings: (body: SettingsInput) =>
    take(
      client.PUT("/api/v1/admin/settings", {
        body,
        params: { header: { "X-CSRF-Token": csrfToken } },
      }),
    ),
  categories: () => take(client.GET("/api/v1/admin/categories")),
  saveCategory: (body: CategoryInput, id?: string) =>
    id
      ? take(
          client.PUT("/api/v1/admin/categories/{id}", {
            params: { path: { id }, header: { "X-CSRF-Token": csrfToken } },
            body,
          }),
        )
      : take(
          client.POST("/api/v1/admin/categories", {
            params: { header: { "X-CSRF-Token": csrfToken } },
            body,
          }),
        ),
  deleteCategory: (id: string) =>
    take(
      client.DELETE("/api/v1/admin/categories/{id}", {
        params: { path: { id }, header: { "X-CSRF-Token": csrfToken } },
      }),
    ),
  reorderCategories: (ids: string[]) =>
    take(
      client.PUT("/api/v1/admin/categories/reorder", {
        params: { header: { "X-CSRF-Token": csrfToken } },
        body: { ids },
      }),
    ),
  tags: () => take(client.GET("/api/v1/admin/tags")),
  saveTag: (name: string, id?: string) =>
    id
      ? take(
          client.PUT("/api/v1/admin/tags/{id}", {
            params: { path: { id }, header: { "X-CSRF-Token": csrfToken } },
            body: { name },
          }),
        )
      : take(
          client.POST("/api/v1/admin/tags", {
            params: { header: { "X-CSRF-Token": csrfToken } },
            body: { name },
          }),
        ),
  deleteTag: (id: string) =>
    take(
      client.DELETE("/api/v1/admin/tags/{id}", {
        params: { path: { id }, header: { "X-CSRF-Token": csrfToken } },
      }),
    ),
  service: (id: string) =>
    take(
      client.GET("/api/v1/admin/services/{id}", { params: { path: { id } } }),
    ),
  async services(signal?: AbortSignal): Promise<Service[]> {
    const first = await take(
      client.GET("/api/v1/admin/services", {
        params: { query: { page: 1, pageSize: 200 } },
        signal,
      }),
    );
    if (first.total < 0 || first.total > 5000)
      throw new ApiError(500, "INTERNAL_ERROR");
    const items = [...first.items];
    for (let page = 2; page <= Math.ceil(first.total / 200); page++) {
      const next = await take(
        client.GET("/api/v1/admin/services", {
          params: { query: { page, pageSize: 200 } },
          signal,
        }),
      );
      if (next.total !== first.total) throw new ApiError(409, "CONFLICT");
      items.push(...next.items);
    }
    if (
      items.length !== first.total ||
      new Set(items.map((item) => item.id)).size !== items.length
    )
      throw new ApiError(409, "CONFLICT");
    return items;
  },
  saveService: (body: ServiceInput, id?: string) =>
    id
      ? take(
          client.PUT("/api/v1/admin/services/{id}", {
            params: { path: { id }, header: { "X-CSRF-Token": csrfToken } },
            body,
          }),
        )
      : take(
          client.POST("/api/v1/admin/services", {
            params: { header: { "X-CSRF-Token": csrfToken } },
            body,
          }),
        ),
  deleteService: (id: string) =>
    take(
      client.DELETE("/api/v1/admin/services/{id}", {
        params: { path: { id }, header: { "X-CSRF-Token": csrfToken } },
      }),
    ),
  reorderServices: (categoryId: string | null, ids: string[]) =>
    take(
      client.PUT("/api/v1/admin/services/reorder", {
        params: { header: { "X-CSRF-Token": csrfToken } },
        body: { categoryId, ids },
      }),
    ),
  upload: (file: File) =>
    take(
      client.POST("/api/v1/admin/assets", {
        params: { header: { "X-CSRF-Token": csrfToken } },
        body: { file },
        bodySerializer(body) {
          const form = new FormData();
          form.set("file", body.file, file.name);
          return form;
        },
      }),
    ),
  deleteAsset: (id: string) =>
    take(
      client.DELETE("/api/v1/admin/assets/{id}", {
        params: { path: { id }, header: { "X-CSRF-Token": csrfToken } },
      }),
    ),
  export: (includeAssets = true) =>
    take(
      client.GET("/api/v1/admin/backup/export", {
        params: { query: { includeAssets } },
      }),
    ),
  // Preserve raw file JSON so the server can reject duplicate keys, not a parsed
  // and silently normalized object. Server validation remains the trust boundary.
  validate: (body: unknown) =>
    take(
      client.POST("/api/v1/admin/backup/validate", {
        params: { header: { "X-CSRF-Token": csrfToken } },
        body: body as Backup,
        bodySerializer: () =>
          typeof body === "string" ? body : JSON.stringify(body),
      }),
    ),
  restore: (importToken: string) =>
    take(
      client.POST("/api/v1/admin/backup/commit", {
        params: { header: { "X-CSRF-Token": csrfToken } },
        body: { importToken, replace: true },
      }),
    ),
  async icons() {
    // ponytail: the contract has no asset-list endpoint. Load the bounded backup
    // only when opening the library, then discard its base64 and configuration.
    const backup = await api.export();
    const used = new Set(backup.services.map((service) => service.iconAssetId));
    return backup.assets.map((asset) => ({
      id: asset.id,
      mimeType: asset.mimeType,
      byteSize:
        (asset.base64.length * 3) / 4 -
        (asset.base64.endsWith("==") ? 2 : asset.base64.endsWith("=") ? 1 : 0),
      url: `/assets/${asset.id}`,
      inUse: used.has(asset.id),
    }));
  },
};

export async function invalidateConfiguration() {
  await queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === "admin" ||
      query.queryKey[0] === "bootstrap" ||
      query.queryKey[0] === "health",
  });
}
