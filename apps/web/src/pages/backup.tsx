import { useEffect, useState } from "react";
import { Download, FileCheck2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/app/preferences";
import { api, ApiError, invalidateConfiguration } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  ErrorState,
  Field,
  PageHeading,
  useUnsaved,
} from "@/components/common";

type Preview = Awaited<ReturnType<typeof api.validate>> & { expiresAt: number };
const maxBackupBytes = 16 * 1024 * 1024;
export function BackupPage() {
  const { t } = useI18n();
  const [includeIcons, setIncludeIcons] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>();
  const [file, setFile] = useState<File | null>(null);
  const [fileVersion, setFileVersion] = useState(0);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<unknown>();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<unknown>();
  const [restored, setRestored] = useState(false);
  const guard = useUnsaved(file !== null || preview !== null);
  const busy = exporting || validating || committing;
  const expiresAt = preview?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(
      () =>
        setPreview((current) =>
          current?.expiresAt === expiresAt
            ? { ...current, importToken: "" }
            : current,
        ),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const download = async () => {
    setExporting(true);
    setExportError(undefined);
    try {
      const backup = await api.export(includeIcons);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup), "\n"], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `nexa-home-${new Date().toISOString().replaceAll(":", "-")}.json`;
      try {
        document.body.append(link);
        link.click();
        toast.success(t("exported"));
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    } catch (error) {
      setExportError(error);
    } finally {
      setExporting(false);
    }
  };
  const validate = async () => {
    if (!file || busy) return;
    setPreview(null);
    setValidationError(undefined);
    setCommitError(undefined);
    setRestored(false);
    setConfirmed(false);
    if (file.size > maxBackupBytes) {
      setValidationError(new ApiError(413, "LIMIT_EXCEEDED"));
      return;
    }
    setValidating(true);
    try {
      // Fatal UTF-8 decoding rejects damaged source bytes; preserving the BOM
      // and raw JSON lets the strict server parser reject them and duplicate keys.
      const raw = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(await file.arrayBuffer());
      const result = await api.validate(raw);
      if (!result.valid || !result.importToken)
        throw new ApiError(400, "VALIDATION_ERROR");
      setPreview({ ...result, expiresAt: Date.now() + 5 * 60 * 1000 });
    } catch (error) {
      setValidationError(error);
    } finally {
      setValidating(false);
    }
  };
  const commit = async () => {
    if (!preview?.importToken || !confirmed || committing) return;
    if (Date.now() >= preview.expiresAt) {
      setPreview({ ...preview, importToken: "" });
      setConfirmed(false);
      return;
    }
    const token = preview.importToken;
    // Every attempt consumes the server token, including failed transactions.
    setPreview({ ...preview, importToken: "" });
    setCommitting(true);
    setCommitError(undefined);
    try {
      await api.restore(token);
      await invalidateConfiguration();
      setPreview(null);
      setFile(null);
      setFileVersion((current) => current + 1);
      setConfirmed(false);
      setRestored(true);
      toast.success(t("restoreSuccess"));
    } catch (error) {
      setCommitError(error);
    } finally {
      setCommitting(false);
    }
  };
  const validationMessage = validationError
    ? file && file.size > maxBackupBytes
      ? t("backupTooLarge")
      : !(validationError instanceof ApiError) || validationError.status === 400
        ? t("invalidJson")
        : undefined
    : undefined;
  return (
    <>
      <PageHeading title={t("backup")} description={t("backupIntro")} />
      <div className="form-stack max-w-2xl">
        {restored && (
          <p role="status" className="notice">
            {t("restoreSuccess")}
          </p>
        )}
        <section className="form-section">
          <h2 className="flex items-center gap-2">
            <Download size={20} aria-hidden="true" />
            {t("exportBackup")}
          </h2>
          <p>{t("exportHint")}</p>
          <label className="check-field">
            <Checkbox
              checked={includeIcons}
              disabled={busy}
              onCheckedChange={(next) => setIncludeIcons(next === true)}
            />
            <span>{t("includeIcons")}</span>
          </label>
          {exportError !== undefined && <ErrorState error={exportError} />}
          <div>
            <Button
              id="export-backup"
              disabled={busy}
              onClick={() => {
                void download();
              }}
            >
              {exporting ? t("loading") : t("exportBackup")}
            </Button>
          </div>
        </section>
        <section className="form-section">
          <h2 className="flex items-center gap-2">
            <Upload size={20} aria-hidden="true" />
            {t("restoreBackup")}
          </h2>
          <p>{t("restoreDescription")}</p>
          <Field
            name="backupFile"
            label={t("backupFile")}
            hint={t("backupFileHint")}
          >
            <Input
              key={fileVersion}
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setValidationError(undefined);
                setCommitError(undefined);
              }}
            />
          </Field>
          {validationError !== undefined && (
            <ErrorState error={validationError} message={validationMessage} />
          )}
          <div>
            <Button
              id="validate-backup"
              disabled={!file || busy}
              onClick={() => {
                void validate();
              }}
            >
              <FileCheck2 size={18} aria-hidden="true" />
              {validating ? t("validating") : t("validateBackup")}
            </Button>
          </div>
        </section>
      </div>
      <AlertDialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open && !committing) {
            setPreview(null);
            setConfirmed(false);
            setCommitError(undefined);
          }
        }}
      >
        <AlertDialogContent
          aria-busy={committing}
          onEscapeKeyDown={(event) => {
            if (committing) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document
              .getElementById(file ? "validate-backup" : "export-backup")
              ?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t("restoreWarning")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("restoreDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <h3 className="font-medium">{t("restorePreview")}</h3>
          <dl className="result-summary">
            {(["services", "categories", "tags", "assets"] as const).map(
              (key) => (
                <div key={key} className="flex gap-2">
                  <dt className="muted">
                    {t(key === "assets" ? "savedIcons" : key)}
                  </dt>
                  <dd className="font-medium">{preview?.summary[key] ?? 0}</dd>
                </div>
              ),
            )}
          </dl>
          {!!preview?.summary.settingsChanged && (
            <p className="notice">{t("settingsChanged")}</p>
          )}
          <p className="field-hint">{t("importExpires")}</p>
          {commitError !== undefined && (
            <ErrorState
              error={commitError}
              message={
                commitError instanceof ApiError && commitError.status === 403
                  ? t("importExpired")
                  : undefined
              }
            />
          )}
          {preview && !preview.importToken && !committing && (
            <p role="status" className="notice">
              {t("importExpired")}
            </p>
          )}
          <label className="check-field">
            <Checkbox
              checked={confirmed}
              disabled={committing || !preview?.importToken}
              onCheckedChange={(value) => setConfirmed(value === true)}
            />
            <span>{t("confirmReplace")}</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={committing}
              onClick={() => {
                setPreview(null);
                setConfirmed(false);
              }}
            >
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!confirmed || !preview?.importToken || committing}
              onClick={(event) => {
                event.preventDefault();
                void commit();
              }}
            >
              {committing ? t("restoring") : t("commitRestore")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {guard.dialog}
    </>
  );
}
