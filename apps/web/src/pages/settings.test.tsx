import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Link, Outlet } from "react-router-dom";
import { PreferencesProvider } from "@/app/preferences";
import { AppearancePage, SecurityPage } from "./settings";
import { renderRoutes } from "@/test/render";
import { apiURL, denied, server } from "@/test/server";
import { csrf, settings } from "@/test/fixtures";
import { queryClient, type SettingsInput } from "@/lib/api/client";

const routes = [
  {
    element: (
      <PreferencesProvider>
        <Link to="/other">Leave settings</Link>
        <Outlet />
      </PreferencesProvider>
    ),
    children: [
      { path: "/appearance", element: <AppearancePage /> },
      { path: "/security", element: <SecurityPage /> },
      { path: "/other", element: <h1>Another page</h1> },
      { path: "/login", element: <h1>Sign in</h1> },
    ],
  },
];
it("uses deterministic appearance Save/Cancel and preserves the shared settings revision", async () => {
  let current = settings;
  const saved: SettingsInput[] = [];
  server.use(
    http.get(apiURL("/admin/settings"), () => HttpResponse.json(current)),
    http.put(apiURL("/admin/settings"), async ({ request }) => {
      const input = (await request.json()) as SettingsInput;
      saved.push(input);
      const { expectedRevision, ...fields } = input;
      current = { ...current, ...fields, revision: expectedRevision + 1 };
      return HttpResponse.json(current);
    }),
  );
  const { user } = renderRoutes(routes, "/appearance");
  const title = await screen.findByRole("textbox", { name: "Site title" });
  await user.clear(title);
  await user.type(title, "Discard this");
  expect(saved).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(title).toHaveValue("Nexa Home");
  await user.clear(title);
  await user.type(title, "Our services");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toMatchObject({
    expectedRevision: 1,
    siteTitle: "Our services",
    accessMode: "public",
    theme: "dark",
    glassEnabled: true,
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled(),
  );
  expect(title).toHaveValue("Our services");
  expect(JSON.stringify(localStorage)).not.toContain("Our services");
});
it("keeps a conflicting draft until explicitly reloading the latest settings", async () => {
  let current = settings;
  server.use(
    http.get(apiURL("/admin/settings"), () => HttpResponse.json(current)),
    http.put(apiURL("/admin/settings"), () => {
      current = { ...settings, siteTitle: "Changed elsewhere", revision: 2 };
      return denied(409, "REVISION_CONFLICT");
    }),
  );
  const { user } = renderRoutes(routes, "/appearance");
  const title = await screen.findByRole("textbox", { name: "Site title" });
  await user.clear(title);
  await user.type(title, "My unsaved title");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Settings changed in another session.",
  );
  expect(title).toHaveValue("My unsaved title");
  await user.click(screen.getByRole("button", { name: "Reload settings" }));
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Reload settings",
    }),
  );
  await waitFor(() => expect(title).toHaveValue("Changed elsewhere"));
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
});
it("prompts for unsaved appearance navigation and keeps the draft when cancelled", async () => {
  const { user, router } = renderRoutes(routes, "/appearance");
  await user.type(
    await screen.findByRole("textbox", { name: "Site subtitle" }),
    " Edited",
  );
  await user.click(screen.getByRole("link", { name: "Leave settings" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Keep editing",
    }),
  );
  expect(router.state.location.pathname).toBe("/appearance");
  expect(screen.getByRole("textbox", { name: "Site subtitle" })).toHaveValue(
    `${settings.siteSubtitle} Edited`,
  );
});
it("saves access mode only on request and guards both security forms with one unsaved prompt", async () => {
  let saved: SettingsInput | undefined;
  server.use(
    http.put(apiURL("/admin/settings"), async ({ request }) => {
      saved = (await request.json()) as SettingsInput;
      const { expectedRevision, ...fields } = saved;
      return HttpResponse.json({
        ...settings,
        ...fields,
        revision: expectedRevision + 1,
      });
    }),
  );
  const { user } = renderRoutes(routes, "/security");
  await user.click(
    await screen.findByRole("combobox", { name: "Homepage access" }),
  );
  await user.click(screen.getByRole("option", { name: "Private" }));
  expect(saved).toBeUndefined();
  await user.type(
    screen.getByLabelText("Current password"),
    "current password",
  );
  await user.click(screen.getByRole("link", { name: "Leave settings" }));
  expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Keep editing",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(saved?.accessMode).toBe("private"));
  expect(saved).toMatchObject({
    siteTitle: settings.siteTitle,
    expectedRevision: 1,
  });
  expect(screen.getByLabelText("Current password")).toHaveValue(
    "current password",
  );
});
it("keeps password input after a wrong-current-password response without expiring a valid session", async () => {
  const me = { username: "owner", csrfToken: csrf };
  queryClient.setQueryData(["me"], me);
  server.use(
    http.get(apiURL("/auth/me"), () => HttpResponse.json(me)),
    http.put(apiURL("/auth/password"), () => denied()),
  );
  const { user } = renderRoutes(routes, "/security");
  await user.type(
    await screen.findByLabelText("Current password"),
    "incorrect password",
  );
  await user.type(
    screen.getByLabelText("New password"),
    "a new strong password",
  );
  await user.type(
    screen.getByLabelText("Confirm password"),
    "a new strong password",
  );
  await user.click(screen.getByRole("button", { name: "Change password" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The current password is incorrect.",
  );
  expect(screen.getByLabelText("New password")).toHaveValue(
    "a new strong password",
  );
  expect(queryClient.getQueryData(["me"])).toEqual(me);
});
it("revokes local authenticated state and redirects after a successful password change", async () => {
  queryClient.setQueryData(["me"], { username: "owner", csrfToken: csrf });
  queryClient.setQueryData(["admin", "private"], "private state");
  server.use(
    http.put(
      apiURL("/auth/password"),
      () => new HttpResponse(null, { status: 204 }),
    ),
  );
  const { user, router } = renderRoutes(routes, "/security");
  await user.type(
    await screen.findByLabelText("Current password"),
    "current password",
  );
  await user.type(
    screen.getByLabelText("New password"),
    "a new strong password",
  );
  await user.type(
    screen.getByLabelText("Confirm password"),
    "a new strong password",
  );
  await user.click(screen.getByRole("button", { name: "Change password" }));
  await screen.findByRole("heading", { name: "Sign in" });
  expect(router.state.location.search).toBe("?reason=password");
  expect(queryClient.getQueryData(["me"])).toBeNull();
  expect(queryClient.getQueryData(["admin", "private"])).toBeUndefined();
  expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
});
