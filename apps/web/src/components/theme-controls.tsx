import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Check,
  Download,
  Palette,
  Plus,
  Server,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n, usePreferences } from "@/app/preferences";
import type { MessageKey } from "@/locales/en";
import {
  appearanceChoice,
  downloadText,
  newThemeLibraryId,
  readThemeFile,
  type Appearance,
  type BuiltinPreset,
  type CustomTheme,
  type PersonalAppearance,
  type ThemeLibraryEntry,
} from "@/lib/themes";
import { isColor } from "@/lib/forms";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogTrigger } from "./ui/dialog";
import { ConfirmDialog, Field, ModalContent } from "./common";

const presetNames: Record<BuiltinPreset, MessageKey> = {
  "future-glass": "themeFutureGlass",
  graphite: "themeGraphite",
  tide: "themeTide",
  forest: "themeForest",
  dune: "themeDune",
};
const presetHints: Record<BuiltinPreset, MessageKey> = {
  "future-glass": "futureGlassHint",
  graphite: "graphiteHint",
  tide: "tideHint",
  forest: "forestHint",
  dune: "duneHint",
};

function ThemeSample({
  value,
  mode,
  miniature = false,
}: {
  value: Appearance;
  mode: "light" | "dark";
  miniature?: boolean;
}) {
  const { t } = useI18n();
  const style = window.NexaTheme.tokens(value, mode) as CSSProperties;
  if (miniature)
    return (
      <span className="theme-miniature" style={style} aria-hidden="true">
        <i />
        <span />
        <span />
        <span />
      </span>
    );
  return (
    <div className="theme-sample" style={style}>
      <p className="theme-sample-mode">{t(mode)}</p>
      <strong>Nexa Home</strong>
      <div className="theme-sample-search">{t("searchPlaceholder")}</div>
      <div className="theme-sample-card">
        <Server size={22} aria-hidden="true" />
        <div>
          <strong>{t("previewName")}</strong>
          <p>{t("previewDescription")}</p>
        </div>
      </div>
      <span className="theme-sample-action">{t("manage")}</span>
    </div>
  );
}

export function ThemeControls({
  value,
  onChange,
  appearance,
}: {
  value: PersonalAppearance;
  onChange(value: PersonalAppearance): void;
  appearance: Appearance;
}) {
  const { t } = useI18n();
  const preferences = usePreferences();
  const { setPreview } = preferences;
  const [mode, setMode] = useState<"light" | "dark">(preferences.resolvedTheme);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ThemeLibraryEntry | null>(null);
  const [pending, setPending] = useState<
    { kind: "json"; theme: CustomTheme } | { kind: "css"; css: string } | null
  >(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const importVersion = useRef(0);
  const jsonInput = useRef<HTMLInputElement>(null);
  const cssInput = useRef<HTMLInputElement>(null);
  const custom = value.customTheme;
  const valid = window.NexaTheme.validPersonal(value);
  useEffect(
    () => () => {
      importVersion.current++;
      setPreview(null);
    },
    [setPreview],
  );
  const change = (next: PersonalAppearance) => {
    setPreview(null);
    onChange(next);
    setError(null);
  };
  const updateTheme = (next: CustomTheme) =>
    change({ ...value, themePreset: "custom", customTheme: next });
  const importFile = async (file: File | undefined, kind: "json" | "css") => {
    if (!file) return;
    const version = ++importVersion.current;
    setPending(null);
    setError(null);
    try {
      const source = await readThemeFile(file, kind);
      const result =
        kind === "json"
          ? {
              kind: "json" as const,
              theme: window.NexaTheme.parseTheme(source),
            }
          : { kind: "css" as const, css: source };
      if (result.kind === "css" && !window.NexaTheme.validCSS(result.css))
        throw new Error("Invalid CSS");
      if (version === importVersion.current) setPending(result);
    } catch {
      if (version === importVersion.current)
        setError(kind === "json" ? "invalidThemeFile" : "cssInvalid");
    }
  };
  const saveLibrary = () => {
    if (!window.NexaTheme.validTheme(custom)) return;
    const existing = preferences.library.find((entry) => entry.id === entryId);
    if (!existing && preferences.library.length >= 10) {
      setError("themeLibraryFull");
      return;
    }
    const entry = {
      id: existing?.id ?? newThemeLibraryId(),
      theme: { ...custom, name: custom.name.trim() },
    };
    const library = existing
      ? preferences.library.map((item) => (item.id === entry.id ? entry : item))
      : [...preferences.library, entry];
    if (!preferences.setLibrary(library)) {
      setError("themeStorageError");
      return;
    }
    setEntryId(entry.id);
    setError(null);
    toast.success(t("themeLibrarySaved"));
  };
  return (
    <div className="theme-controls form-stack">
      <section className="form-section">
        <h2>{t("themeStyles")}</h2>
        <p>{t("themeStylesHint")}</p>
        <div
          className="theme-presets"
          role="group"
          aria-label={t("themeStyles")}
        >
          {window.NexaTheme.presets.map((preset) => (
            <button
              type="button"
              className="theme-preset"
              key={preset}
              aria-label={t(presetNames[preset])}
              aria-description={t(presetHints[preset])}
              aria-pressed={value.themePreset === preset}
              onClick={() =>
                change({
                  ...value,
                  themePreset: preset,
                  customTheme: window.NexaTheme.validTheme(custom)
                    ? custom
                    : null,
                })
              }
            >
              <span className="theme-miniatures">
                <ThemeSample
                  value={{ themePreset: preset }}
                  mode="light"
                  miniature
                />
                <ThemeSample
                  value={{ themePreset: preset }}
                  mode="dark"
                  miniature
                />
              </span>
              <span className="theme-preset-name">
                {t(presetNames[preset])}
                {value.themePreset === preset && (
                  <Check size={16} aria-hidden="true" />
                )}
              </span>
              <span className="theme-preset-hint">
                {t(presetHints[preset])}
              </span>
            </button>
          ))}
          {custom && (
            <button
              type="button"
              className="theme-preset"
              aria-label={custom.name || t("customTheme")}
              aria-description={t("customTheme")}
              aria-pressed={value.themePreset === "custom"}
              onClick={() => change({ ...value, themePreset: "custom" })}
            >
              <span className="theme-miniatures">
                <ThemeSample
                  value={{ themePreset: "custom", customTheme: custom }}
                  mode="light"
                  miniature
                />
                <ThemeSample
                  value={{ themePreset: "custom", customTheme: custom }}
                  mode="dark"
                  miniature
                />
              </span>
              <span className="theme-preset-name">
                <bdi>{custom.name || t("customTheme")}</bdi>
                {value.themePreset === "custom" && (
                  <Check size={16} aria-hidden="true" />
                )}
              </span>
              <span className="theme-preset-hint">{t("customTheme")}</span>
            </button>
          )}
        </div>
        <div className="actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const preset =
                value.themePreset === "custom"
                  ? "future-glass"
                  : value.themePreset;
              const name = t("themeCopyName", {
                name:
                  value.themePreset === "custom"
                    ? (custom?.name ?? t("customTheme"))
                    : t(presetNames[preset]),
              });
              const definition =
                custom && value.themePreset === "custom"
                  ? structuredClone(custom)
                  : window.NexaTheme.definition(preset, name);
              definition.name = name;
              if (preset === "future-glass" && value.themePreset !== "custom") {
                for (const variant of ["light", "dark"] as const)
                  definition.variants[variant].accent = window.NexaTheme.tokens(
                    appearance,
                    variant,
                  )["--accent"]!;
              }
              setEntryId(null);
              updateTheme(definition);
            }}
          >
            <Plus size={18} aria-hidden="true" />
            {t("customizeTheme")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => jsonInput.current?.click()}
          >
            <Upload size={18} aria-hidden="true" />
            {t("importTheme")}
          </Button>
        </div>
        <input
          ref={jsonInput}
          type="file"
          accept=".json,application/json"
          hidden
          tabIndex={-1}
          aria-label={t("importTheme")}
          onChange={(event) => {
            void importFile(event.target.files?.[0], "json");
            event.target.value = "";
          }}
        />
        <p className="field-hint">{t("importThemeHint")}</p>
      </section>

      {value.themePreset === "custom" && custom && (
        <section className="form-section">
          <h2>{t("customTheme")}</h2>
          <p>{t("themeTokensHint")}</p>
          <Field
            name="themeName"
            label={t("name")}
            hint={t("nameHint")}
            error={
              !custom.name.trim() || [...custom.name].length > 80
                ? t("invalidName")
                : undefined
            }
          >
            <Input
              value={custom.name}
              onChange={(event) =>
                updateTheme({ ...custom, name: event.target.value })
              }
            />
          </Field>
          {(["light", "dark"] as const).map((variant) => (
            <fieldset className="theme-variant" key={variant}>
              <legend>{t(variant)}</legend>
              <div className="theme-color-fields">
                {(["background", "surface", "accent"] as const).map((token) => (
                  <ThemeColor
                    key={token}
                    name={`theme-${variant}-${token}`}
                    label={t(
                      token === "background"
                        ? "themeBackground"
                        : token === "surface"
                          ? "themeSurface"
                          : "accent",
                    )}
                    value={custom.variants[variant][token]}
                    onChange={(color) =>
                      updateTheme({
                        ...custom,
                        variants: {
                          ...custom.variants,
                          [variant]: {
                            ...custom.variants[variant],
                            [token]: color,
                          },
                        },
                      })
                    }
                  />
                ))}
              </div>
            </fieldset>
          ))}
          <div className="field-row">
            <Field name="themeRadius" label={t("themeRadius")}>
              <select
                className="theme-native-select"
                dir="ltr"
                value={custom.radius}
                onChange={(event) =>
                  updateTheme({
                    ...custom,
                    radius: Number(event.target.value) as CustomTheme["radius"],
                  })
                }
              >
                {([8, 12, 16, 20] as const).map((radius) => (
                  <option key={radius} value={radius}>
                    {radius} px
                  </option>
                ))}
              </select>
            </Field>
            <Field name="themeShadow" label={t("themeShadow")}>
              <select
                className="theme-native-select"
                value={custom.shadow}
                onChange={(event) =>
                  updateTheme({
                    ...custom,
                    shadow: event.target.value as CustomTheme["shadow"],
                  })
                }
              >
                <option value="none">{t("shadowNone")}</option>
                <option value="soft">{t("shadowSoft")}</option>
              </select>
            </Field>
          </div>
          {!window.NexaTheme.validTheme(custom) && (
            <p role="alert" className="error-text">
              {t("invalidTheme")}
            </p>
          )}
          <div className="actions">
            <Button
              type="button"
              variant="outline"
              disabled={!window.NexaTheme.validTheme(custom)}
              onClick={saveLibrary}
            >
              {preferences.library.some((entry) => entry.id === entryId)
                ? t("themeUpdateLibrary")
                : t("themeSaveLibrary")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!window.NexaTheme.validTheme(custom)}
              onClick={() => {
                downloadText(
                  JSON.stringify(custom, null, 2) + "\n",
                  "nexa-home-theme.json",
                  "application/json",
                );
                toast.success(t("themeDownload"));
              }}
            >
              <Download size={18} aria-hidden="true" />
              {t("exportTheme")}
            </Button>
          </div>
        </section>
      )}

      <details className="theme-details">
        <summary>
          {t("themeLibrary")} ({preferences.library.length}/10)
        </summary>
        <p className="field-hint">{t("themeLibraryHint")}</p>
        <ul className="theme-library">
          {preferences.library.map((entry) => (
            <li key={entry.id}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEntryId(entry.id);
                  updateTheme(structuredClone(entry.theme));
                }}
                aria-label={t("useSavedTheme", { name: entry.theme.name })}
              >
                <Palette size={18} aria-hidden="true" />
                <bdi>{entry.theme.name}</bdi>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("deleteSavedTheme", { name: entry.theme.name })}
                onClick={() => setDeleting(entry)}
              >
                <Trash2 size={18} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      </details>

      <details className="theme-details">
        <summary>{t("advancedCSS")}</summary>
        <div className="notice">
          <strong>{t("advancedCSS")}</strong>
          <p className="mt-2">{t("cssWarning")}</p>
        </div>
        <Field
          name="customCSS"
          label={t("advancedCSS")}
          hint={t("cssHint")}
          error={
            !window.NexaTheme.validCSS(value.customCSS)
              ? t("cssInvalid")
              : undefined
          }
        >
          <Textarea
            dir="ltr"
            className="theme-css-editor"
            rows={8}
            spellCheck={false}
            value={value.customCSS}
            onChange={(event) =>
              change({ ...value, customCSS: event.target.value })
            }
          />
        </Field>
        <div className="actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => cssInput.current?.click()}
          >
            <Upload size={18} aria-hidden="true" />
            {t("importCSS")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              !value.customCSS || !window.NexaTheme.validCSS(value.customCSS)
            }
            onClick={() => {
              downloadText(value.customCSS, "nexa-home-theme.css", "text/css");
              toast.success(t("themeDownload"));
            }}
          >
            <Download size={18} aria-hidden="true" />
            {t("exportCSS")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!value.customCSS}
            onClick={() => change({ ...value, customCSS: "" })}
          >
            {t("clear")}
          </Button>
        </div>
        <input
          ref={cssInput}
          type="file"
          accept=".css,text/css"
          hidden
          tabIndex={-1}
          aria-label={t("importCSS")}
          onChange={(event) => {
            void importFile(event.target.files?.[0], "css");
            event.target.value = "";
          }}
        />
        <p className="field-hint">
          <a href="/?appearance=safe" className="theme-safe-link underline">
            {t("safeAppearance")}
          </a>{" "}
          — {t("safeAppearanceHint")}
        </p>
      </details>

      {pending && (
        <section
          className="notice form-stack"
          aria-label={t(
            pending.kind === "json" ? "confirmThemeImport" : "confirmCSSImport",
          )}
        >
          {pending.kind === "json" ? (
            <>
              <strong dir="auto">{pending.theme.name}</strong>
              <div className="theme-samples">
                <ThemeSample
                  value={{ themePreset: "custom", customTheme: pending.theme }}
                  mode="light"
                />
                <ThemeSample
                  value={{ themePreset: "custom", customTheme: pending.theme }}
                  mode="dark"
                />
              </div>
            </>
          ) : (
            <pre className="theme-import-source" dir="ltr">
              {pending.css}
            </pre>
          )}
          <div className="actions">
            <Button
              type="button"
              onClick={() => {
                if (pending.kind === "json") {
                  setEntryId(null);
                  updateTheme(pending.theme);
                } else change({ ...value, customCSS: pending.css });
                setPending(null);
              }}
            >
              {t(
                pending.kind === "json"
                  ? "confirmThemeImport"
                  : "confirmCSSImport",
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPending(null)}
            >
              {t("cancel")}
            </Button>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="error-text">
          {t(error)}
        </p>
      )}

      <section className="form-section" aria-label={t("preview")}>
        <h2>{t("preview")}</h2>
        <div className="theme-samples">
          <ThemeSample value={{ ...appearance, ...value }} mode="light" />
          <ThemeSample value={{ ...appearance, ...value }} mode="dark" />
        </div>
        <p>{t("themePreviewHint")}</p>
        <div className="theme-preview-actions">
          <Field name="themePreviewMode" label={t("themePreviewMode")}>
            <select
              className="theme-native-select"
              value={mode}
              onChange={(event) => {
                setPreview(null);
                setMode(event.target.value as "light" | "dark");
              }}
            >
              <option value="light">{t("light")}</option>
              <option value="dark">{t("dark")}</option>
            </select>
          </Field>
          <Button
            type="button"
            variant="outline"
            disabled={!valid || preferences.safeMode}
            onClick={() => setPreview({ ...appearance, ...value, theme: mode })}
          >
            {t("themePreviewApply")}
          </Button>
          {preferences.preview && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreview(null)}
            >
              {t("themePreviewCancel")}
            </Button>
          )}
        </div>
      </section>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("deleteThemeTitle")}
        description={t("deleteThemeHint")}
        onConfirm={() => {
          if (!deleting) return;
          if (
            !preferences.setLibrary(
              preferences.library.filter((entry) => entry.id !== deleting.id),
            )
          ) {
            setError("themeStorageError");
            return;
          }
          if (entryId === deleting.id) setEntryId(null);
        }}
      />
    </div>
  );
}

function ThemeColor({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  const { t } = useI18n();
  return (
    <div className="theme-color">
      <Field
        name={name}
        label={label}
        error={!isColor(value) ? t("invalidColor") : undefined}
      >
        <Input
          dir="ltr"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
      <input
        type="color"
        aria-label={`${t("pickColor")}: ${label}`}
        value={isColor(value) ? value : "#000000"}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function SafeAppearanceNotice() {
  const { t } = useI18n();
  const { safeMode } = usePreferences();
  if (!safeMode) return null;
  return (
    <div className="notice safe-appearance" role="status">
      <p>{t("safeAppearanceActive")}</p>
      <Button asChild variant="outline">
        <a href={window.location.pathname}>{t("leaveSafeAppearance")}</a>
      </Button>
    </div>
  );
}

export function PersonalThemes() {
  const { t } = useI18n();
  const { setPreview } = usePreferences();
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setPreview(null);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("themeStyles")}>
          <Palette size={20} aria-hidden="true" />
        </Button>
      </DialogTrigger>
      {open && <PersonalThemeForm close={() => setOpen(false)} />}
    </Dialog>
  );
}
function PersonalThemeForm({ close }: { close(): void }) {
  const { t } = useI18n();
  const preferences = usePreferences();
  const [value, setValue] = useState<PersonalAppearance>(
    () =>
      preferences.personal ?? {
        ...appearanceChoice(preferences.sharedAppearance),
        customCSS: "",
      },
  );
  const [error, setError] = useState(false);
  return (
    <ModalContent
      className="theme-dialog"
      title={t("personalAppearance")}
      description={t("personalAppearanceHint")}
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!preferences.setPersonal(value)) {
            setError(true);
            return;
          }
          preferences.setPreview(null);
          toast.success(t("personalSaved"));
          close();
        }}
      >
        <ThemeControls
          value={value}
          onChange={(next) => {
            setError(false);
            setValue(next);
          }}
          appearance={{ ...preferences.sharedAppearance, accent: undefined }}
        />
        {error && (
          <p role="alert" className="error-text">
            {t("themeStorageError")}
          </p>
        )}
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!preferences.setPersonal(null)) {
                setError(true);
                return;
              }
              preferences.setPreview(null);
              close();
            }}
          >
            {t("useSiteAppearance")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              preferences.setPreview(null);
              close();
            }}
          >
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            disabled={!window.NexaTheme.validPersonal(value)}
          >
            {t("personalSave")}
          </Button>
        </div>
      </form>
    </ModalContent>
  );
}
