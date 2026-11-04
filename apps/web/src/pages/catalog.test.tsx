import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Outlet } from "react-router-dom";
import { PreferencesProvider } from "@/app/preferences";
import { CategoriesPage, TagsPage } from "./catalog";
import { renderRoutes } from "@/test/render";
import { apiURL, denied, server } from "@/test/server";
import { categories, fixtureId, stamp, tags } from "@/test/fixtures";
import { queryClient, type CategoryInput } from "@/lib/api/client";

const routes = [
  {
    element: (
      <PreferencesProvider>
        <Outlet />
      </PreferencesProvider>
    ),
    children: [
      { path: "/categories", element: <CategoriesPage /> },
      { path: "/tags", element: <TagsPage /> },
    ],
  },
];
it("creates a category, refreshes the list and returns focus to the add control", async () => {
  const items = [...categories];
  let saved: CategoryInput | undefined;
  server.use(
    http.get(apiURL("/admin/categories"), () => HttpResponse.json(items)),
    http.post(apiURL("/admin/categories"), async ({ request }) => {
      saved = (await request.json()) as CategoryInput;
      const item = {
        ...saved,
        id: fixtureId(3),
        position: 2,
        createdAt: stamp,
        updatedAt: stamp,
      };
      items.push(item);
      return HttpResponse.json(item, { status: 201 });
    }),
  );
  const { user } = renderRoutes(routes, "/categories");
  await user.click(await screen.findByRole("button", { name: "Add category" }));
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await user.type(within(dialog).getByLabelText("Name"), "Personal");
  await user.type(
    within(dialog).getByLabelText("Description"),
    "Private tools",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Save changes" }),
  );
  expect(await screen.findByText("Personal")).toBeVisible();
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(saved).toEqual({
    name: "Personal",
    description: "Private tools",
    icon: "layout-grid",
    isVisible: true,
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Add category" })).toHaveFocus(),
  );
});
it("retains an edited category after a collision and warns before discarding modal input", async () => {
  server.use(
    http.put(apiURL(`/admin/categories/${categories[0]!.id}`), () =>
      denied(409, "CONFLICT"),
    ),
  );
  const { user } = renderRoutes(routes, "/categories");
  await user.click(await screen.findByRole("button", { name: "Edit: Media" }));
  const name = screen.getByRole("textbox", { name: "Name" });
  await user.clear(name);
  await user.type(name, "Workspace");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "A name or reference conflicts",
  );
  expect(name).toHaveValue("Workspace");
  await user.keyboard("{Escape}");
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Keep editing",
    }),
  );
  expect(name).toHaveValue("Workspace");
  await user.keyboard("{Escape}");
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Discard changes",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});
it("rejects oversized category text without sending a mutation", async () => {
  const { user } = renderRoutes(routes, "/categories");
  await user.click(await screen.findByRole("button", { name: "Add category" }));
  const name = screen.getByRole("textbox", { name: "Name" });
  fireEvent.change(name, { target: { value: "家".repeat(51) } });
  fireEvent.blur(name);
  expect(name).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
});
it("reorders the complete category set including hidden groups", async () => {
  const items = categories.map((item, index) => ({
    ...item,
    isVisible: index === 0,
  }));
  let saved: unknown;
  server.use(
    http.get(apiURL("/admin/categories"), () => HttpResponse.json(items)),
    http.put(apiURL("/admin/categories/reorder"), async ({ request }) => {
      saved = await request.json();
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderRoutes(routes, "/categories");
  await user.click(
    await screen.findByRole("button", { name: "Move down: Media" }),
  );
  await waitFor(() =>
    expect(saved).toEqual({ ids: [items[1]!.id, items[0]!.id] }),
  );
});
it("explains the visibility consequences before deleting a category", async () => {
  let deleted = false;
  server.use(
    http.delete(apiURL(`/admin/categories/${categories[0]!.id}`), () => {
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderRoutes(routes, "/categories");
  await user.click(
    await screen.findByRole("button", { name: "Delete: Media" }),
  );
  const dialog = screen.getByRole("alertdialog");
  expect(within(dialog).getByText(/They may become public/)).toBeVisible();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(deleted).toBe(false);
  await user.click(screen.getByRole("button", { name: "Delete: Media" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Delete",
    }),
  );
  await waitFor(() => expect(deleted).toBe(true));
});
it("creates, edits and deletes tags using name-only requests", async () => {
  let items = [...tags];
  const requests: unknown[] = [];
  server.use(
    http.get(apiURL("/admin/tags"), () => HttpResponse.json(items)),
    http.post(apiURL("/admin/tags"), async ({ request }) => {
      const body = (await request.json()) as { name: string };
      requests.push(body);
      const item = { id: fixtureId(11), name: body.name, createdAt: stamp };
      items.push(item);
      return HttpResponse.json(item, { status: 201 });
    }),
    http.put(apiURL(`/admin/tags/${fixtureId(11)}`), async ({ request }) => {
      const body = (await request.json()) as { name: string };
      requests.push(body);
      items = items.map((item) =>
        item.id === fixtureId(11) ? { ...item, name: body.name } : item,
      );
      return HttpResponse.json(items[1]);
    }),
    http.delete(apiURL(`/admin/tags/${fixtureId(11)}`), () => {
      items = items.filter((item) => item.id !== fixtureId(11));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderRoutes(routes, "/tags");
  await user.click(await screen.findByRole("button", { name: "Add tag" }));
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Projects");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await user.click(
    await screen.findByRole("button", { name: "Edit: Projects" }),
  );
  const name = screen.getByRole("textbox", { name: "Name" });
  await user.clear(name);
  await user.type(name, "Work");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await user.click(await screen.findByRole("button", { name: "Delete: Work" }));
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Delete",
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Edit: Work" }),
    ).not.toBeInTheDocument(),
  );
  expect(requests).toEqual([{ name: "Projects" }, { name: "Work" }]);
});
it("provides retry rather than an endless loader on catalog failure", async () => {
  queryClient.setQueryDefaults(["admin", "categories"], { retry: false });
  server.use(
    http.get(apiURL("/admin/categories"), () => denied(500, "INTERNAL_ERROR")),
  );
  renderRoutes(routes, "/categories");
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
});
