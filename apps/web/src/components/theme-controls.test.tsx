import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PreferencesProvider } from "@/app/preferences";
import { PersonalThemes } from "./theme-controls";
import { renderRoutes } from "@/test/render";
import { settings } from "@/test/fixtures";
import type { Appearance, CustomTheme } from "@/lib/themes";

function renderThemes(shared: Appearance = settings) {
  return renderRoutes([
    {
      path: "/",
      element: (
        <PreferencesProvider appearance={shared}>
          <PersonalThemes />
        </PreferencesProvider>
      ),
    },
  ]);
}
async function openThemes(user: ReturnType<typeof renderThemes>["user"]) {
  await user.click(screen.getByRole("button", { name: "Theme styles" }));
  return within(await screen.findByRole("dialog", { name: "Your appearance" }));
}
const imported = (name = "My imported Tide") =>
  window.NexaTheme.definition("tide", name);
const jsonFile = (value: unknown) =>
  new File(
    [typeof value === "string" ? value : JSON.stringify(value)],
    "theme.json",
    { type: "application/json" },
  );

it("opens recovery controls from a corrupt shared appearance cache before private bootstrap is available", async () => {
  localStorage.setItem(
    "nexa.appearance",
    JSON.stringify({
      themePreset: "custom",
      customTheme: { broken: true },
      customCSS: "body { display:none!important; }",
    }),
  );
  const { user } = renderRoutes([
    {
      path: "/",
      element: (
        <PreferencesProvider>
          <PersonalThemes />
        </PreferencesProvider>
      ),
    },
  ]);
  const dialog = await openThemes(user);
  expect(dialog.getByRole("button", { name: "Future Glass" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(document.getElementById("nexa-custom-css")).toBeNull();
  await user.click(dialog.getByRole("button", { name: "Graphite" }));
  await user.click(dialog.getByRole("button", { name: "Use in this browser" }));
  expect(document.documentElement.dataset.themePreset).toBe("graphite");
});

it("lets a preset replace an invalid custom draft instead of retaining invisible validation errors", async () => {
  const { user } = renderThemes();
  const dialog = await openThemes(user);
  await user.click(dialog.getByRole("button", { name: "Customize a copy" }));
  await user.clear(dialog.getByRole("textbox", { name: "Name" }));
  expect(
    dialog.getByRole("button", { name: "Use in this browser" }),
  ).toBeDisabled();
  await user.click(dialog.getByRole("button", { name: "Graphite" }));
  expect(
    dialog.getByRole("button", { name: "Use in this browser" }),
  ).toBeEnabled();
  await user.click(dialog.getByRole("button", { name: "Use in this browser" }));
  expect(
    JSON.parse(localStorage.getItem("nexa.personalAppearance")!).customTheme,
  ).toBeNull();
});

it("keeps preset changes local, supports explicit cancel/save, and restores site styling as a unit", async () => {
  const { user } = renderThemes({
    ...settings,
    themePreset: "forest",
    customCSS: "body { --site-marker: 1; }",
  });
  let dialog = await openThemes(user);
  await user.click(dialog.getByRole("button", { name: "Tide" }));
  expect(document.documentElement.dataset.themePreset).toBe("forest");
  expect(localStorage.getItem("nexa.personalAppearance")).toBeNull();
  await user.click(dialog.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  dialog = await openThemes(user);
  await user.click(dialog.getByRole("button", { name: "Dune" }));
  await user.click(dialog.getByRole("button", { name: "Use in this browser" }));
  expect(document.documentElement.dataset.themePreset).toBe("dune");
  expect(document.getElementById("nexa-custom-css")).toBeNull();
  expect(
    JSON.parse(localStorage.getItem("nexa.personalAppearance")!).customCSS,
  ).toBe("");
  dialog = await openThemes(user);
  expect(dialog.getByRole("button", { name: "Dune" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(dialog.getByRole("button", { name: "Use site appearance" }));
  expect(document.documentElement.dataset.themePreset).toBe("forest");
  expect(document.getElementById("nexa-custom-css")).toHaveTextContent(
    "--site-marker",
  );
});

it("previews a custom stylesheet explicitly and Escape restores appearance without losing the editor draft", async () => {
  const { user } = renderThemes();
  const dialog = await openThemes(user);
  await user.click(dialog.getByText("Advanced CSS", { selector: "summary" }));
  const editor = dialog.getByRole("textbox", { name: "Advanced CSS" });
  const css =
    "/* </style><script>not executable</script> */ body { --local-marker: 1; }";
  fireEvent.change(editor, { target: { value: css } });
  expect(editor).toHaveAttribute("dir", "ltr");
  expect(document.getElementById("nexa-custom-css")).toBeNull();
  await user.selectOptions(
    dialog.getByRole("combobox", { name: "Page preview mode" }),
    "light",
  );
  await user.click(dialog.getByRole("button", { name: "Preview on page" }));
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(document.getElementById("nexa-custom-css")?.textContent).toBe(css);
  expect(document.querySelectorAll("script")).toHaveLength(0);
  expect(localStorage.getItem("nexa.personalAppearance")).toBeNull();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Your appearance" })).toBeVisible();
  expect(document.getElementById("nexa-custom-css")).toBeNull();
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(editor).toHaveValue(css);
  await user.click(dialog.getByRole("button", { name: "Preview on page" }));
  await user.click(dialog.getByRole("button", { name: "Stop preview" }));
  expect(document.getElementById("nexa-custom-css")).toBeNull();
  await user.click(dialog.getByRole("button", { name: "Use in this browser" }));
  expect(document.getElementById("nexa-custom-css")?.textContent).toBe(css);
  expect(localStorage.getItem("nexa.theme")).toBeNull();
});

it("clones immutable presets, edits both palettes/radius/shadow, and updates a saved library entry explicitly", async () => {
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
    throw new Error(
      "Secure-context-only API unavailable on an HTTP LAN origin",
    );
  });
  const { user } = renderThemes();
  const dialog = await openThemes(user);
  await user.click(dialog.getByRole("button", { name: "Customize a copy" }));
  const name = dialog.getByRole("textbox", { name: "Name" });
  await user.clear(name);
  await user.type(name, "My home theme");
  for (const mode of ["Light", "Dark"]) {
    const group = within(dialog.getByRole("group", { name: mode }));
    const accent = group.getByRole("textbox", { name: "Accent color" });
    fireEvent.change(accent, {
      target: { value: mode === "Light" ? "#006c73" : "#6bd3cc" },
    });
  }
  await user.selectOptions(
    dialog.getByRole("combobox", { name: "Corner radius" }),
    "20",
  );
  await user.selectOptions(
    dialog.getByRole("combobox", { name: "Shadow" }),
    "none",
  );
  await user.click(
    dialog.getByRole("button", { name: "Save to this browser's library" }),
  );
  let library = JSON.parse(localStorage.getItem("nexa.themes")!) as {
    id: string;
    theme: CustomTheme;
  }[];
  expect(library).toHaveLength(1);
  expect(library[0]!.theme).toMatchObject({
    name: "My home theme",
    radius: 20,
    shadow: "none",
    variants: { light: { accent: "#006c73" }, dark: { accent: "#6bd3cc" } },
  });
  const id = library[0]!.id;
  await user.clear(name);
  await user.type(name, "Updated home");
  await user.click(dialog.getByRole("button", { name: "Update saved theme" }));
  library = JSON.parse(localStorage.getItem("nexa.themes")!);
  expect(library).toHaveLength(1);
  expect(library[0]!.id).toBe(id);
  expect(library[0]!.theme.name).toBe("Updated home");
  await user.click(dialog.getByText(/Saved themes/, { selector: "summary" }));
  await user.click(dialog.getByRole("button", { name: "Use Updated home" }));
  await user.click(dialog.getByRole("button", { name: "Use in this browser" }));
  expect(document.documentElement.dataset.themePreset).toBe("custom");
  expect(document.documentElement.style.getPropertyValue("--radius")).toBe(
    "20px",
  );
  expect(window.NexaTheme.definition("future-glass", "Original").radius).toBe(
    16,
  );
});

it("deletes only a confirmed browser library copy and leaves the selected appearance intact", async () => {
  const theme = imported("Saved Tide");
  localStorage.setItem(
    "nexa.themes",
    JSON.stringify([{ id: crypto.randomUUID(), theme }]),
  );
  localStorage.setItem(
    "nexa.personalAppearance",
    JSON.stringify({
      themePreset: "custom",
      customTheme: theme,
      customCSS: "",
    }),
  );
  const { user } = renderThemes();
  const dialog = await openThemes(user);
  await user.click(dialog.getByText(/Saved themes/, { selector: "summary" }));
  await user.click(dialog.getByRole("button", { name: "Delete Saved Tide" }));
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(JSON.parse(localStorage.getItem("nexa.themes")!)).toHaveLength(1);
  await user.click(dialog.getByRole("button", { name: "Delete Saved Tide" }));
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Delete",
    }),
  );
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem("nexa.themes")!)).toEqual([]),
  );
  expect(document.documentElement.dataset.themePreset).toBe("custom");
  expect(
    JSON.parse(localStorage.getItem("nexa.personalAppearance")!).customTheme
      .name,
  ).toBe("Saved Tide");
});

it("enforces the ten-theme library cap without overwriting a built-in or losing the draft", async () => {
  localStorage.setItem(
    "nexa.themes",
    JSON.stringify(
      Array.from({ length: 10 }, (_, i) => ({
        id: crypto.randomUUID(),
        theme: imported(`Theme ${i}`),
      })),
    ),
  );
  const { user } = renderThemes();
  const dialog = await openThemes(user);
  await user.click(dialog.getByRole("button", { name: "Customize a copy" }));
  await user.click(
    dialog.getByRole("button", { name: "Save to this browser's library" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "already has 10 themes",
  );
  expect(JSON.parse(localStorage.getItem("nexa.themes")!)).toHaveLength(10);
  expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue(
    "Future Glass copy",
  );
});

it("imports a token file into a review step without applying or saving it until confirmation", async () => {
  const { user } = renderThemes();
  const dialog = await openThemes(user);
  await user.upload(
    dialog.getByLabelText("Import theme JSON", { exact: true }),
    jsonFile(imported()),
  );
  await screen.findByRole("button", { name: "Use imported theme" });
  expect(
    dialog.queryByRole("textbox", { name: "Name" }),
  ).not.toBeInTheDocument();
  expect(document.documentElement.dataset.themePreset).toBe("future-glass");
  expect(localStorage.getItem("nexa.personalAppearance")).toBeNull();
  expect(localStorage.getItem("nexa.themes")).toBeNull();
  await user.click(dialog.getByRole("button", { name: "Use imported theme" }));
  expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue(
    "My imported Tide",
  );
  expect(
    dialog.getByRole("button", { name: "Use in this browser" }),
  ).toBeEnabled();
  expect(document.documentElement.dataset.themePreset).toBe("future-glass");
});

it("rejects malformed, duplicate, unknown, oversized and invalid UTF-8 token imports", async () => {
  const { user } = renderThemes();
  const dialog = await openThemes(user);
  const valid = JSON.stringify(imported());
  for (const file of [
    jsonFile(
      valid.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
    ),
    jsonFile({ ...imported(), css: "body{}" }),
    jsonFile(" ".repeat(16385)),
    new File([new Uint8Array([0xff])], "theme.json", {
      type: "application/json",
    }),
  ]) {
    await user.upload(
      dialog.getByLabelText("Import theme JSON", { exact: true }),
      file,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a valid UTF-8 theme JSON",
    );
    expect(
      dialog.queryByRole("button", { name: "Use imported theme" }),
    ).not.toBeInTheDocument();
  }
  expect(document.documentElement.dataset.themePreset).toBe("future-glass");
});

it("does not let a late file read replace a more recent import selection", async () => {
  const { user } = renderThemes();
  const dialog = await openThemes(user);
  let finish!: (data: ArrayBuffer) => void;
  const delayed = new Promise<ArrayBuffer>((resolve) => {
    finish = resolve;
  });
  const old = jsonFile(imported("Old selection"));
  Object.defineProperty(old, "arrayBuffer", { value: () => delayed });
  await user.upload(
    dialog.getByLabelText("Import theme JSON", { exact: true }),
    old,
  );
  await user.upload(
    dialog.getByLabelText("Import theme JSON", { exact: true }),
    jsonFile(imported("New selection")),
  );
  await screen.findByRole("button", { name: "Use imported theme" });
  await act(async () => {
    finish(
      new TextEncoder().encode(JSON.stringify(imported("Old selection")))
        .buffer,
    );
  });
  await user.click(dialog.getByRole("button", { name: "Use imported theme" }));
  expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue(
    "New selection",
  );
});

it("validates CSS imports separately and never applies an imported file implicitly", async () => {
  const { user } = renderThemes();
  const dialog = await openThemes(user);
  await user.click(dialog.getByText("Advanced CSS", { selector: "summary" }));
  for (const file of [
    new File(["a".repeat(65537)], "theme.css", { type: "text/css" }),
    new File(["\0"], "theme.css", { type: "text/css" }),
  ]) {
    await user.upload(
      dialog.getByLabelText("Import CSS file", { exact: true }),
      file,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "valid UTF-8 CSS without NUL",
    );
  }
  const css = "@media (min-width: 1px) { body:has(a) { --custom: 1; } }";
  await user.upload(
    dialog.getByLabelText("Import CSS file", { exact: true }),
    new File([css], "theme.css", { type: "text/css" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Use imported CSS" }),
  );
  const editor = dialog.getByRole("textbox", { name: "Advanced CSS" });
  expect(editor).toHaveValue(css);
  expect(document.getElementById("nexa-custom-css")).toBeNull();
  fireEvent.change(editor, { target: { value: "a".repeat(65537) } });
  expect(
    dialog.getByRole("button", { name: "Use in this browser" }),
  ).toBeDisabled();
  await user.click(dialog.getByRole("button", { name: "Clear" }));
  expect(editor).toHaveValue("");
  expect(
    dialog.getByRole("button", { name: "Use in this browser" }),
  ).toBeEnabled();
});

it("keeps token JSON and raw CSS exports separate, names downloads safely and revokes object URLs", async () => {
  const create = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const revoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  const blobs: Blob[] = [];
  const filenames: string[] = [];
  const revoked = vi.fn();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: (blob: Blob) => {
      blobs.push(blob);
      return `blob:theme-${blobs.length}`;
    },
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revoked,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    filenames.push(this.download);
  });
  try {
    const { user } = renderThemes();
    const dialog = await openThemes(user);
    await user.click(dialog.getByRole("button", { name: "Customize a copy" }));
    await user.click(dialog.getByRole("button", { name: "Export theme JSON" }));
    await user.click(dialog.getByText("Advanced CSS", { selector: "summary" }));
    fireEvent.change(dialog.getByRole("textbox", { name: "Advanced CSS" }), {
      target: { value: "body { --my-css: 1; }" },
    });
    await user.click(dialog.getByRole("button", { name: "Export CSS file" }));
    expect(filenames).toEqual(["nexa-home-theme.json", "nexa-home-theme.css"]);
    const theme = JSON.parse(await blobs[0]!.text());
    expect(theme).not.toHaveProperty("css");
    expect(window.NexaTheme.validTheme(theme)).toBe(true);
    expect(await blobs[1]!.text()).toBe("body { --my-css: 1; }");
    await waitFor(() => expect(revoked).toHaveBeenCalledTimes(2));
  } finally {
    if (create) Object.defineProperty(URL, "createObjectURL", create);
    else Reflect.deleteProperty(URL, "createObjectURL");
    if (revoke) Object.defineProperty(URL, "revokeObjectURL", revoke);
    else Reflect.deleteProperty(URL, "revokeObjectURL");
  }
});

it("retains an invalid custom draft and reports storage failures instead of claiming a save", async () => {
  const { user } = renderThemes();
  const dialog = await openThemes(user);
  await user.click(dialog.getByRole("button", { name: "Customize a copy" }));
  const dark = within(dialog.getByRole("group", { name: "Dark" }));
  fireEvent.change(dark.getByRole("textbox", { name: "Surface" }), {
    target: { value: "#ffffff" },
  });
  expect(
    dialog.getByRole("button", { name: "Use in this browser" }),
  ).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("share readable text");
  fireEvent.change(dark.getByRole("textbox", { name: "Surface" }), {
    target: { value: "#111a2a" },
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Quota");
  });
  await user.click(dialog.getByRole("button", { name: "Use in this browser" }));
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "storage is unavailable or full",
  );
  expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue(
    "Future Glass copy",
  );
});
