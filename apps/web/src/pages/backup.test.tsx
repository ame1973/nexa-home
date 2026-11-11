import { expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { PreferencesProvider } from "@/app/preferences";
import { BackupPage } from "./backup";
import { renderRoutes } from "@/test/render";
import { apiURL, denied, server } from "@/test/server";
import { bootstrap, stamp } from "@/test/fixtures";
import { queryClient } from "@/lib/api/client";

const backup = {
  format: "nexa-home-backup",
  version: 1,
  exportedAt: stamp,
  settings: bootstrap.settings,
  categories: bootstrap.categories,
  services: bootstrap.services,
  tags: bootstrap.tags,
  assets: [],
};
const token = "T".repeat(43);
const validated = {
  valid: true,
  summary: {
    services: 6,
    categories: 2,
    tags: 1,
    assets: 0,
    settingsChanged: 1,
  },
  importToken: token,
};
function renderBackup() {
  return renderRoutes([
    {
      path: "/",
      element: (
        <PreferencesProvider>
          <BackupPage />
        </PreferencesProvider>
      ),
    },
  ]);
}

it("preserves duplicate source keys for strict server validation rather than normalizing JSON", async () => {
  const raw = '{"version":1,"version":2}';
  let received = "";
  server.use(
    http.post(apiURL("/admin/backup/validate"), async ({ request }) => {
      received = await request.text();
      return denied(400, "VALIDATION_ERROR");
    }),
  );
  const { user } = renderBackup();
  await user.upload(
    screen.getByLabelText("Backup JSON file"),
    new File([raw], "duplicate.json", { type: "application/json" }),
  );
  await user.click(screen.getByRole("button", { name: "Validate backup" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Choose a valid Nexa Home JSON backup.",
  );
  expect(received).toBe(raw);
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
it("rejects invalid UTF-8 and oversized files before any validation request", async () => {
  let calls = 0;
  server.use(
    http.post(apiURL("/admin/backup/validate"), () => {
      calls++;
      return HttpResponse.json(validated);
    }),
  );
  const { user } = renderBackup();
  await user.upload(
    screen.getByLabelText("Backup JSON file"),
    new File([new Uint8Array([0xff, 0xfe])], "invalid.json", {
      type: "application/json",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Validate backup" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Choose a valid Nexa Home JSON backup.",
  );
  await user.upload(
    screen.getByLabelText("Backup JSON file"),
    new File([new Uint8Array(16 * 1024 * 1024 + 1)], "large.json", {
      type: "application/json",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Validate backup" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The backup file must be at most 16 MiB.",
  );
  expect(calls).toBe(0);
});
it("shows a count/settings preview, requires explicit acknowledgement and consumes the token once", async () => {
  let committed = 0;
  let raw = "";
  server.use(
    http.post(apiURL("/admin/backup/validate"), async ({ request }) => {
      raw = await request.text();
      return HttpResponse.json(validated);
    }),
    http.post(apiURL("/admin/backup/commit"), async ({ request }) => {
      expect(await request.json()).toEqual({
        importToken: token,
        replace: true,
      });
      committed++;
      return HttpResponse.json({ revision: 2 });
    }),
  );
  const { user } = renderBackup();
  await user.upload(
    screen.getByLabelText("Backup JSON file"),
    new File([JSON.stringify(backup)], "backup.json", {
      type: "application/json",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Validate backup" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent(
    "Restored health checks will contact their configured addresses. Restore only trusted backups.",
  );
  expect(
    within(dialog).getByText("Homepage settings will change."),
  ).toBeVisible();
  expect(within(dialog).getByText("6")).toBeVisible();
  const replace = within(dialog).getByRole("button", {
    name: "Replace configuration",
  });
  expect(replace).toBeDisabled();
  expect(committed).toBe(0);
  expect(document.body.textContent).not.toContain(token);
  expect(JSON.stringify(localStorage)).not.toContain(token);
  await user.click(
    within(dialog).getByLabelText(
      "I understand this replaces the current configuration.",
    ),
  );
  await user.click(replace);
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Configuration restored.",
  );
  expect(committed).toBe(1);
  expect(raw).toBe(JSON.stringify(backup));
  expect(
    screen.getByRole("button", { name: "Validate backup" }),
  ).toBeDisabled();
  expect(
    JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    ),
  ).not.toContain(token);
});
it("does not replay a failed commit and requires a fresh validation", async () => {
  let attempts = 0;
  server.use(
    http.post(apiURL("/admin/backup/validate"), () =>
      HttpResponse.json(validated),
    ),
    http.post(apiURL("/admin/backup/commit"), () => {
      attempts++;
      return denied(500, "INTERNAL_ERROR");
    }),
  );
  const { user } = renderBackup();
  await user.upload(
    screen.getByLabelText("Backup JSON file"),
    new File([JSON.stringify(backup)], "backup.json", {
      type: "application/json",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Validate backup" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(
    within(dialog).getByLabelText(
      "I understand this replaces the current configuration.",
    ),
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Replace configuration" }),
  );
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "The server could not complete this request.",
  );
  expect(
    within(dialog).getByRole("button", { name: "Replace configuration" }),
  ).toBeDisabled();
  expect(attempts).toBe(1);
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Validate backup" }));
  expect(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Replace configuration",
    }),
  ).toBeDisabled();
  expect(attempts).toBe(1);
});
it("rechecks expiry on commit even if a background tab delayed its expiry timer", async () => {
  let attempts = 0;
  server.use(
    http.post(apiURL("/admin/backup/validate"), () =>
      HttpResponse.json(validated),
    ),
    http.post(apiURL("/admin/backup/commit"), () => {
      attempts++;
      return HttpResponse.json({ revision: 2 });
    }),
  );
  const { user } = renderBackup();
  await user.upload(
    screen.getByLabelText("Backup JSON file"),
    new File([JSON.stringify(backup)], "backup.json", {
      type: "application/json",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Validate backup" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(
    within(dialog).getByLabelText(
      "I understand this replaces the current configuration.",
    ),
  );
  const future = Date.now() + 6 * 60 * 1000;
  vi.spyOn(Date, "now").mockReturnValue(future);
  await user.click(
    within(dialog).getByRole("button", { name: "Replace configuration" }),
  );
  expect(
    await within(dialog).findByText(
      "The preview expired or was already used. Validate the file again.",
    ),
  ).toBeVisible();
  expect(attempts).toBe(0);
});
it("downloads a compact local JSON file and honors the include-icons option", async () => {
  let include = "";
  let downloaded: Blob | undefined;
  let filename = "";
  const create = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const revoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn((blob: Blob) => {
      downloaded = blob;
      return "blob:local-backup";
    }),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    filename = this.download;
  });
  server.use(
    http.get(apiURL("/admin/backup/export"), ({ request }) => {
      include = new URL(request.url).searchParams.get("includeAssets") ?? "";
      return HttpResponse.json(backup);
    }),
  );
  try {
    const { user } = renderBackup();
    await user.click(screen.getByLabelText("Include icon files"));
    await user.click(screen.getByRole("button", { name: "Export backup" }));
    await waitFor(() => expect(downloaded).toBeDefined());
    expect(include).toBe("false");
    expect(filename).toMatch(/^nexa-home-.*\.json$/);
    expect(JSON.parse(await downloaded!.text())).toEqual(backup);
    await waitFor(() =>
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-backup"),
    );
  } finally {
    if (create) Object.defineProperty(URL, "createObjectURL", create);
    else Reflect.deleteProperty(URL, "createObjectURL");
    if (revoke) Object.defineProperty(URL, "revokeObjectURL", revoke);
    else Reflect.deleteProperty(URL, "revokeObjectURL");
  }
});
