import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { PreferencesProvider } from "@/app/preferences";
import { AppearancePage, SecurityPage } from "./settings";
import { renderRoutes } from "@/test/render";
import { apiURL, denied, server } from "@/test/server";
import { settings } from "@/test/fixtures";
import {
  queryClient,
  type Settings,
  type SettingsInput,
} from "@/lib/api/client";

const routes = [
  {
    path: "/appearance",
    element: (
      <PreferencesProvider>
        <AppearancePage />
      </PreferencesProvider>
    ),
  },
  {
    path: "/security",
    element: (
      <PreferencesProvider>
        <SecurityPage />
      </PreferencesProvider>
    ),
  },
];

it("saves shared style/CSS through the existing revision gate and cancels previews with the draft", async () => {
  let current: Settings = {
    ...settings,
    themePreset: "future-glass",
    customTheme: null,
    customCSS: "",
  };
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
  await user.click(await screen.findByRole("button", { name: "Tide" }));
  await user.click(screen.getByRole("button", { name: "Preview on page" }));
  expect(document.documentElement.dataset.themePreset).toBe("tide");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(document.documentElement.dataset.themePreset).toBe("future-glass");
  expect(saved).toEqual([]);
  await user.click(screen.getByRole("button", { name: "Forest" }));
  await user.click(screen.getByText("Advanced CSS", { selector: "summary" }));
  const css =
    "@media (min-width: 1px) { .service-tile { border-width: 2px; } }";
  await user.type(
    screen.getByRole("textbox", { name: "Advanced CSS" }),
    css.replaceAll("{", "{{"),
  );
  expect(document.getElementById("nexa-custom-css")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toMatchObject({
    expectedRevision: 1,
    themePreset: "forest",
    customTheme: null,
    customCSS: css,
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled(),
  );
  expect(JSON.stringify(localStorage)).not.toContain("service-tile");
});

it("preserves conflicting custom theme/CSS drafts until explicit reload without adopting a background revision", async () => {
  let current: Settings = {
    ...settings,
    themePreset: "future-glass",
    customTheme: null,
    customCSS: "",
  };
  const saved: SettingsInput[] = [];
  server.use(
    http.get(apiURL("/admin/settings"), () => HttpResponse.json(current)),
    http.put(apiURL("/admin/settings"), async ({ request }) => {
      saved.push((await request.json()) as SettingsInput);
      return denied(409, "REVISION_CONFLICT");
    }),
  );
  const { user } = renderRoutes(routes, "/appearance");
  await user.click(
    await screen.findByRole("button", { name: "Customize a copy" }),
  );
  const name = screen.getByRole("textbox", { name: "Name" });
  await user.clear(name);
  await user.type(name, "Unsaved custom style");
  await user.click(screen.getByText("Advanced CSS", { selector: "summary" }));
  const css = screen.getByRole("textbox", { name: "Advanced CSS" });
  await user.type(css, "body {{ --draft: 1; }");
  current = {
    ...current,
    revision: 2,
    themePreset: "dune",
    customCSS: "body { --other: 1; }",
  };
  await queryClient.fetchQuery({
    queryKey: ["admin", "settings"],
    queryFn: async () => current,
    staleTime: 0,
  });
  expect(name).toHaveValue("Unsaved custom style");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("alert");
  expect(saved[0]).toMatchObject({
    expectedRevision: 1,
    themePreset: "custom",
    customTheme: { name: "Unsaved custom style" },
    customCSS: "body { --draft: 1; }",
  });
  expect(css).toHaveValue("body { --draft: 1; }");
  await user.click(screen.getByRole("button", { name: "Reload settings" }));
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Reload settings",
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Dune" })).toHaveAttribute(
      "aria-pressed",
      "true",
    ),
  );
  expect(css).toHaveValue("body { --other: 1; }");
});

it("preserves shared custom theme and CSS while changing unrelated access settings", async () => {
  const current: Settings = {
    ...settings,
    themePreset: "custom",
    customTheme: window.NexaTheme.definition("tide", "Shared Tide"),
    customCSS: "body { --shared: 1; }",
  };
  const saved: SettingsInput[] = [];
  server.use(
    http.get(apiURL("/admin/settings"), () => HttpResponse.json(current)),
    http.put(apiURL("/admin/settings"), async ({ request }) => {
      const input = (await request.json()) as SettingsInput;
      saved.push(input);
      return HttpResponse.json({ ...current, ...input, revision: 2 });
    }),
  );
  const { user } = renderRoutes(routes, "/security");
  await user.click(
    await screen.findByRole("combobox", { name: "Homepage access" }),
  );
  await user.click(screen.getByRole("option", { name: "Private" }));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toMatchObject({
    expectedRevision: 1,
    accessMode: "private",
    themePreset: "custom",
    customTheme: current.customTheme,
    customCSS: current.customCSS,
  });
});
