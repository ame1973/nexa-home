import { useRef } from "react";
import { ImagePlus } from "lucide-react";
import { useI18n, usePreferences } from "@/app/preferences";
import type { useBackgroundDraft } from "@/lib/background";
import { Button } from "./ui/button";

export function BackgroundPicker({
  draft,
  scope,
  currentURL,
  siteURL,
  currentKind,
  disabled = false,
}: {
  draft: ReturnType<typeof useBackgroundDraft>;
  scope: "site" | "personal";
  currentURL: string | null;
  siteURL: string | null;
  currentKind: "site" | "personal" | "none";
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const { safeMode } = usePreferences();
  const input = useRef<HTMLInputElement>(null);
  const selection = draft.selection;
  const mode = selection.kind === "keep" ? currentKind : selection.kind;
  const url =
    selection.kind === "file"
      ? selection.url
      : selection.kind === "none"
        ? null
        : selection.kind === "site"
          ? siteURL
          : currentURL;
  return (
    <section className="form-section background-picker">
      <h2>{t("backgroundTitle")}</h2>
      <p>{t("backgroundHint")}</p>
      <p>
        {t(scope === "site" ? "backgroundSiteHint" : "backgroundPersonalHint")}
      </p>
      {!safeMode && url && (
        <img className="background-thumbnail" src={url} alt="" />
      )}
      <p role="status">
        {t(
          mode === "site"
            ? "backgroundSiteActive"
            : mode === "none"
              ? "backgroundNoneActive"
              : "backgroundSelected",
        )}
      </p>
      {draft.invalid && (
        <p role="alert" className="error-text">
          {t("backgroundInvalid")}
        </p>
      )}
      <div className="actions">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={18} aria-hidden="true" />
          {t("backgroundChoose")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || mode === "none"}
          onClick={() => draft.select("none")}
        >
          {t("backgroundNone")}
        </Button>
        {scope === "personal" && (
          <Button
            type="button"
            variant="outline"
            disabled={disabled || mode === "site"}
            onClick={() => draft.select("site")}
          >
            {t("backgroundUseSite")}
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        hidden
        tabIndex={-1}
        aria-label={t("backgroundChoose")}
        onChange={(event) => {
          void draft.choose(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </section>
  );
}
