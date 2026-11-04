import { expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { PreferencesProvider } from "@/app/preferences";
import { IconPicker } from "./icon-picker";
import { renderRoutes } from "@/test/render";
import { apiURL, server } from "@/test/server";
import { bootstrap, fixtureId, stamp } from "@/test/fixtures";
import { serviceInput } from "@/lib/forms";

function renderPicker() {
  const onChange = vi.fn();
  return {
    onChange,
    ...renderRoutes([
      {
        path: "/",
        element: (
          <PreferencesProvider>
            <IconPicker value={serviceInput()} onChange={onChange} />
          </PreferencesProvider>
        ),
      },
    ]),
  };
}
it("searches the finite local registry and returns a built-in icon without fetching a library", async () => {
  let exports = 0;
  server.use(
    http.get(apiURL("/admin/backup/export"), () => {
      exports++;
      return HttpResponse.json({});
    }),
  );
  const { user, onChange } = renderPicker();
  await user.click(screen.getByRole("button", { name: "Choose icon" }));
  const search = screen.getByRole("textbox", { name: "Search icon names…" });
  await user.type(search, "server");
  await user.click(screen.getByRole("button", { name: "Select server" }));
  expect(onChange).toHaveBeenCalledWith({
    iconKind: "lucide",
    iconValue: "server",
    iconAssetId: null,
  });
  expect(exports).toBe(0);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});
it("clears the selected file across tabs and rejects oversized icons before uploading", async () => {
  let uploads = 0;
  server.use(
    http.post(apiURL("/admin/assets"), () => {
      uploads++;
      return HttpResponse.json({});
    }),
  );
  const { user } = renderPicker();
  await user.click(screen.getByRole("button", { name: "Choose icon" }));
  await user.click(screen.getByRole("tab", { name: "Upload" }));
  await user.upload(
    screen.getByLabelText("Icon file"),
    new File(["<svg/>"], "cached.svg", { type: "image/svg+xml" }),
  );
  expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
  await user.click(screen.getByRole("tab", { name: "Favicon" }));
  expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  await user.upload(
    screen.getByLabelText("Icon file"),
    new File([new Uint8Array(1048577)], "too-large.png", { type: "image/png" }),
  );
  await user.click(screen.getByRole("button", { name: "Upload" }));
  expect(
    await screen.findByText("The icon must be at most 1 MiB."),
  ).toBeVisible();
  expect(uploads).toBe(0);
});
it("uploads cached favicons as files, prevents tab changes while pending and never fetches a remote URL", async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const id = fixtureId(700);
  server.use(
    http.post(apiURL("/admin/assets"), async ({ request }) => {
      const file = (await request.formData()).get("file");
      expect(file).not.toBeNull();
      entered();
      await pending;
      return HttpResponse.json(
        { id, mimeType: "image/svg+xml", byteSize: 6, url: `/assets/${id}` },
        { status: 201 },
      );
    }),
  );
  const { user, onChange } = renderPicker();
  await user.click(screen.getByRole("button", { name: "Choose icon" }));
  await user.click(screen.getByRole("tab", { name: "Favicon" }));
  expect(
    screen.getByText(/Nexa Home never fetches a remote icon/),
  ).toBeVisible();
  await user.upload(
    screen.getByLabelText("Icon file"),
    new File(["<svg/>"], "cached.svg", { type: "image/svg+xml" }),
  );
  await user.click(screen.getByRole("button", { name: "Upload" }));
  await started;
  expect(screen.getByRole("tab", { name: "Lucide" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeVisible();
  release();
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith({
      iconKind: "favicon",
      iconValue: "cached.svg",
      iconAssetId: id,
    }),
  );
});
it("loads saved icon metadata lazily and only allows deleting unreferenced assets", async () => {
  const used = fixtureId(701),
    unused = fixtureId(702);
  let exports = 0;
  let deleted = "";
  server.use(
    http.get(apiURL("/admin/backup/export"), () => {
      exports++;
      return HttpResponse.json({
        format: "nexa-home-backup",
        version: 1,
        exportedAt: stamp,
        settings: bootstrap.settings,
        categories: bootstrap.categories,
        services: [{ ...bootstrap.services[0], iconAssetId: used }],
        tags: bootstrap.tags,
        assets: [
          { id: used, mimeType: "image/png", base64: "AAAA" },
          ...(deleted
            ? []
            : [{ id: unused, mimeType: "image/png", base64: "AAAA" }]),
        ],
      });
    }),
    http.delete(apiURL(`/admin/assets/${unused}`), () => {
      deleted = unused;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderPicker();
  await user.click(screen.getByRole("button", { name: "Choose icon" }));
  await user.click(screen.getByRole("tab", { name: "Upload" }));
  expect(exports).toBe(0);
  await user.click(screen.getByRole("button", { name: "Browse saved icons" }));
  const deletes = await screen.findAllByRole("button", { name: /^Delete:/ });
  expect(deletes).toHaveLength(2);
  expect(deletes[0]).toBeDisabled();
  await user.click(deletes[1]!);
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(deleted).toBe(unused));
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(screen.getAllByRole("button", { name: /^Delete:/ })).toHaveLength(1);
});
