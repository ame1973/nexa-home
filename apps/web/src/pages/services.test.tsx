import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Outlet } from "react-router-dom";
import { PreferencesProvider } from "@/app/preferences";
import { ServiceEditorPage } from "./service-editor";
import { ServicesPage } from "./services";
import { renderRoutes } from "@/test/render";
import { apiURL, denied, server } from "@/test/server";
import { fixtureId, fixtureServices, savedService } from "@/test/fixtures";
import { queryClient, type ServiceInput } from "@/lib/api/client";

const routes = [
  {
    element: (
      <PreferencesProvider>
        <Outlet />
      </PreferencesProvider>
    ),
    children: [
      { path: "/admin/services/new", element: <ServiceEditorPage /> },
      { path: "/admin/services/:id", element: <ServiceEditorPage /> },
      { path: "/admin", element: <ServicesPage /> },
    ],
  },
];
it("creates a complete typed service from valid fields and a live non-navigating preview", async () => {
  let saved: ServiceInput | undefined;
  server.use(
    http.post(apiURL("/admin/services"), async ({ request }) => {
      saved = (await request.json()) as ServiceInput;
      return HttpResponse.json(savedService(saved), { status: 201 });
    }),
  );
  const { user, router } = renderRoutes(routes, "/admin/services/new");
  const name = await screen.findByRole("textbox", { name: "Name" });
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await user.type(name, "My NAS");
  await user.type(
    screen.getByLabelText("Primary URL"),
    "https://nas.example.test",
  );
  expect(screen.getByRole("heading", { name: "My NAS" })).toBeVisible();
  expect(
    screen.queryByRole("link", { name: /My NAS/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin"));
  expect(saved).toMatchObject({
    name: "My NAS",
    links: [{ label: "primary", url: "https://nas.example.test" }],
    iconKind: "lucide",
    isVisible: true,
    openMode: "new_tab",
  });
  expect(saved).not.toHaveProperty("id");
});
it("validates on blur, focuses the first invalid field on submit and blocks unsafe URLs", async () => {
  renderRoutes(routes, "/admin/services/new");
  const name = await screen.findByRole("textbox", { name: "Name" });
  fireEvent.blur(name);
  expect(
    await screen.findByText("Enter a name within the character limit."),
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText("Primary URL"), {
    target: { value: "javascript:alert(1)" },
  });
  fireEvent.blur(screen.getByLabelText("Primary URL"));
  expect(screen.getByLabelText("Primary URL")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  fireEvent.submit(name.closest("form")!);
  await waitFor(() => expect(name).toHaveFocus());
});
it("keeps edits on server failure and background refresh, with an explicit unsaved-navigation choice", async () => {
  let current = fixtureServices(1)[0]!;
  server.use(
    http.get(apiURL(`/admin/services/${current.id}`), () =>
      HttpResponse.json(current),
    ),
    http.put(apiURL(`/admin/services/${current.id}`), () =>
      denied(500, "INTERNAL_ERROR"),
    ),
  );
  const { user, router } = renderRoutes(
    routes,
    `/admin/services/${current.id}`,
  );
  const name = await screen.findByRole("textbox", { name: "Name" });
  await user.clear(name);
  await user.type(name, "Keep my edits");
  current = { ...current, name: "Changed elsewhere" };
  await queryClient.invalidateQueries({
    queryKey: ["admin", "service", current.id],
  });
  expect(name).toHaveValue("Keep my edits");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The server could not complete this request.",
  );
  expect(name).toHaveValue("Keep my edits");
  await user.click(screen.getByRole("link", { name: "Cancel" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(
    within(dialog).getByRole("button", { name: "Keep editing" }),
  );
  expect(router.state.location.pathname).toBe(`/admin/services/${current.id}`);
  await user.click(screen.getByRole("link", { name: "Cancel" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Discard changes",
    }),
  );
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin"));
});
it("sends whole category scopes including hidden services for keyboard reorder", async () => {
  const services = fixtureServices(4);
  services[3]!.isVisible = false;
  server.use(
    http.get(apiURL("/admin/services"), () =>
      HttpResponse.json({
        items: services,
        total: services.length,
        page: 1,
        pageSize: 200,
      }),
    ),
  );
  let payload: unknown;
  server.use(
    http.put(apiURL("/admin/services/reorder"), async ({ request }) => {
      payload = await request.json();
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderRoutes(routes, "/admin?view=services");
  await user.click(
    await screen.findByRole("button", { name: "Move down: Jellyfin" }),
  );
  await waitFor(() =>
    expect(payload).toEqual({
      categoryId: fixtureId(2),
      ids: [services[3]!.id, services[1]!.id],
    }),
  );
  expect(payload).toBeDefined();
});
it("disables reorder when search filters hide part of a scope and supports no-result recovery", async () => {
  const { user } = renderRoutes(routes, "/admin?view=services");
  await user.type(await screen.findByRole("searchbox"), "Jellyfin");
  expect(
    await screen.findByRole("button", { name: "Move down: Jellyfin" }),
  ).toBeDisabled();
  await user.clear(screen.getByRole("searchbox"));
  await user.type(screen.getByRole("searchbox"), "not in this catalog");
  expect(await screen.findByText("No matching services")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Clear" }));
  expect(
    await screen.findByRole("link", { name: "Synology Photos" }),
  ).toBeVisible();
});
it("retains the delete confirmation on failure, then removes the service after retry", async () => {
  const services = fixtureServices(1);
  let fail = true;
  let deleted = false;
  server.use(
    http.get(apiURL("/admin/services"), () =>
      HttpResponse.json({
        items: deleted ? [] : services,
        total: deleted ? 0 : 1,
        page: 1,
        pageSize: 200,
      }),
    ),
    http.delete(apiURL(`/admin/services/${services[0]!.id}`), () => {
      if (fail) return denied(500, "INTERNAL_ERROR");
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderRoutes(routes, "/admin");
  await user.click(
    await screen.findByRole("button", { name: "Actions: Synology Photos" }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));
  expect(await within(dialog).findByRole("alert")).toBeVisible();
  expect(deleted).toBe(false);
  fail = false;
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));
  expect(
    await screen.findByText("A place for everything you use."),
  ).toBeVisible();
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
});
it("reads a fresh full service before changing only a flag", async () => {
  const current = {
    ...fixtureServices(1)[0]!,
    description: "Fresh server description",
  };
  let saved: ServiceInput | undefined;
  server.use(
    http.get(apiURL(`/admin/services/${current.id}`), () =>
      HttpResponse.json(current),
    ),
    http.put(apiURL(`/admin/services/${current.id}`), async ({ request }) => {
      saved = (await request.json()) as ServiceInput;
      return HttpResponse.json(savedService(saved, current.id));
    }),
  );
  const { user } = renderRoutes(routes, "/admin");
  await user.click(
    await screen.findByRole("button", { name: "Favorite: Synology Photos" }),
  );
  await waitFor(() =>
    expect(saved).toMatchObject({
      isFavorite: false,
      description: "Fresh server description",
    }),
  );
  expect(saved?.links[0]).not.toHaveProperty("id");
});
it("paginates the complete catalog and resets the page when changing sort", async () => {
  const services = fixtureServices(51);
  server.use(
    http.get(apiURL("/admin/services"), () =>
      HttpResponse.json({
        items: services,
        total: services.length,
        page: 1,
        pageSize: 200,
      }),
    ),
  );
  const { user } = renderRoutes(routes, "/admin");
  const table = await screen.findByRole("table", { name: "Services" });
  expect(within(table).getAllByRole("row")).toHaveLength(51);
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByText("Page 2 of 2")).toBeVisible();
  expect(within(table).getAllByRole("row")).toHaveLength(2);
  await user.click(screen.getByRole("combobox", { name: "Sort" }));
  await user.click(screen.getByRole("option", { name: "Name Z–A" }));
  expect(await screen.findByText("Page 1 of 2")).toBeVisible();
  expect(within(table).getAllByRole("link")[0]).toHaveTextContent(
    "Synology Photos",
  );
});
it("supports cross-category dragging into empty groups and retries both partial scopes", async () => {
  let current = fixtureServices(1)[0]!;
  let fail = true;
  let puts = 0;
  const scopes: unknown[] = [];
  server.use(
    http.get(apiURL("/admin/services"), () =>
      HttpResponse.json({ items: [current], total: 1, page: 1, pageSize: 200 }),
    ),
    http.put(apiURL(`/admin/services/${current.id}`), async ({ request }) => {
      puts++;
      const body = (await request.json()) as ServiceInput;
      current = { ...current, ...body, links: current.links };
      return HttpResponse.json(current);
    }),
    http.put(apiURL("/admin/services/reorder"), async ({ request }) => {
      scopes.push(await request.json());
      return fail
        ? denied(409, "CONFLICT")
        : new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderRoutes(routes, "/admin");
  const handle = await screen.findByRole("button", {
    name: "Drag to reorder: Synology Photos",
  });
  const dataTransfer = { setData() {}, effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(handle, { dataTransfer });
  const target = screen.getByText("Move to category: Workspace");
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
  const retry = await screen.findByRole("button", { name: "Retry ordering" });
  fail = false;
  await user.click(retry);
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Retry ordering" }),
    ).not.toBeInTheDocument(),
  );
  expect(puts).toBe(1);
  expect(scopes).toHaveLength(4);
  expect(scopes.slice(2)).toEqual([
    { categoryId: fixtureId(1), ids: [] },
    { categoryId: fixtureId(2), ids: [current.id] },
  ]);
});
it("finishes both scopes after a partial cross-category edit without resubmitting the service", async () => {
  let current = fixtureServices(1)[0]!;
  let puts = 0;
  let fail = true;
  const scopes: unknown[] = [];
  server.use(
    http.get(apiURL(`/admin/services/${current.id}`), () =>
      HttpResponse.json(current),
    ),
    http.get(apiURL("/admin/services"), () =>
      HttpResponse.json({ items: [current], total: 1, page: 1, pageSize: 200 }),
    ),
    http.put(apiURL(`/admin/services/${current.id}`), async ({ request }) => {
      puts++;
      const body = (await request.json()) as ServiceInput;
      current = {
        ...current,
        ...body,
        links: body.links.map((link, index) => ({
          ...link,
          id: fixtureId(20000 + index),
        })),
      };
      return HttpResponse.json(current);
    }),
    http.put(apiURL("/admin/services/reorder"), async ({ request }) => {
      scopes.push(await request.json());
      return fail
        ? denied(409, "CONFLICT")
        : new HttpResponse(null, { status: 204 });
    }),
  );
  const { user, router } = renderRoutes(
    routes,
    `/admin/services/${current.id}`,
  );
  await user.click(await screen.findByRole("combobox", { name: "Category" }));
  await user.click(await screen.findByRole("option", { name: "Workspace" }));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  const retry = await screen.findByRole("button", { name: "Retry ordering" });
  expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
  fail = false;
  await user.click(retry);
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin"));
  expect(puts).toBe(1);
  expect(scopes).toEqual([
    { categoryId: fixtureId(1), ids: [] },
    { categoryId: fixtureId(2), ids: [current.id] },
    { categoryId: fixtureId(1), ids: [] },
    { categoryId: fixtureId(2), ids: [current.id] },
  ]);
});
