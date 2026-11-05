import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useI18n } from "@/app/preferences";
import {
  api,
  ApiError,
  invalidateConfiguration,
  queryClient,
  type Settings,
  type SettingsInput,
} from "@/lib/api/client";
import {
  isColor,
  settingsInput,
  useDraft,
  validPassword,
  validText,
} from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ConfirmDialog,
  ErrorState,
  Field,
  PageHeading,
  Pending,
  focusInvalid,
  useUnsaved,
} from "@/components/common";

function SettingsFrame({
  children,
}: {
  children(settings: Settings): ReactNode;
}) {
  const settings = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: api.settings,
  });
  if (settings.isPending) return <Pending />;
  if (!settings.data)
    return (
      <ErrorState
        error={settings.error}
        retry={() => {
          void settings.refetch();
        }}
      />
    );
  return (
    <>
      {settings.error && (
        <ErrorState
          error={settings.error}
          retry={() => {
            void settings.refetch();
          }}
        />
      )}
      {children(settings.data)}
    </>
  );
}
export function AppearancePage() {
  return (
    <SettingsFrame>
      {(settings) => <AppearanceForm settings={settings} />}
    </SettingsFrame>
  );
}
export function SecurityPage() {
  return (
    <SettingsFrame>
      {(settings) => <SecurityForm settings={settings} />}
    </SettingsFrame>
  );
}
function AppearanceForm({ settings }: { settings: Settings }) {
  const { t } = useI18n();
  const form = useRef<HTMLFormElement>(null);
  const draft = useDraft(settingsInput(settings));
  const value = draft.value;
  const guard = useUnsaved(draft.dirty);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [reload, setReload] = useState(false);
  const titleValid = validText(value.siteTitle, 1, 80);
  const subtitleValid = validText(value.siteSubtitle, 0, 160);
  const colorValid = isColor(value.accent);
  const mutation = useMutation({
    mutationFn: api.saveSettings,
    onSuccess: async (saved) => {
      queryClient.setQueryData(["admin", "settings"], saved);
      draft.reset();
      await invalidateConfiguration();
      toast.success(t("appearanceSaved"));
    },
  });
  const update = <K extends keyof SettingsInput>(
    field: K,
    next: SettingsInput[K],
  ) => {
    draft.update({ ...value, [field]: next });
    mutation.reset();
  };
  const invalid = (
    name: string,
    valid: boolean,
    key: "invalidName" | "invalidText" | "invalidColor",
  ) =>
    !valid && touched[name]
      ? t(key)
      : mutation.error instanceof ApiError &&
          typeof mutation.error.details[name] === "string"
        ? (mutation.error.details[name] as string)
        : undefined;
  const touch = (name: string) =>
    setTouched((current) => ({ ...current, [name]: true }));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) return;
    setTouched({ siteTitle: true, siteSubtitle: true, accent: true });
    if (!titleValid || !subtitleValid || !colorValid) {
      requestAnimationFrame(() => {
        if (form.current) focusInvalid(form.current);
      });
      return;
    }
    mutation.mutate(value);
  };
  return (
    <>
      <PageHeading title={t("appearance")} description={t("appearanceIntro")} />
      {mutation.error && <ErrorState error={mutation.error} />}
      {mutation.error instanceof ApiError &&
        mutation.error.code === "REVISION_CONFLICT" && (
          <Button
            variant="outline"
            onClick={() => setReload(true)}
            className="mb-5"
          >
            {t("reloadSettings")}
          </Button>
        )}
      <form
        ref={form}
        noValidate
        onSubmit={submit}
        className="form-stack max-w-2xl"
      >
        <fieldset disabled={mutation.isPending} className="form-stack">
          <section className="form-section">
            <h2>{t("globalSettings")}</h2>
            <Field
              name="siteTitle"
              label={t("siteTitle")}
              hint={t("nameHint")}
              error={invalid("siteTitle", titleValid, "invalidName")}
            >
              <Input
                required
                value={value.siteTitle}
                onBlur={() => touch("siteTitle")}
                onChange={(event) => update("siteTitle", event.target.value)}
              />
            </Field>
            <Field
              name="siteSubtitle"
              label={t("siteSubtitle")}
              hint={t("subtitleHint")}
              error={invalid("siteSubtitle", subtitleValid, "invalidText")}
            >
              <Input
                value={value.siteSubtitle}
                onBlur={() => touch("siteSubtitle")}
                onChange={(event) => update("siteSubtitle", event.target.value)}
              />
            </Field>
          </section>
          <section className="form-section">
            <h2>{t("theme")}</h2>
            <Select
              value={value.theme}
              onValueChange={(next) => {
                if (next === "dark" || next === "light" || next === "system")
                  update("theme", next);
              }}
            >
              <Field name="theme" label={t("theme")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </Field>
              <SelectContent>
                {(["dark", "light", "system"] as const).map((theme) => (
                  <SelectItem key={theme} value={theme}>
                    {t(theme)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <Field
                  name="accent"
                  label={t("accent")}
                  hint={t("accentHint")}
                  error={invalid("accent", colorValid, "invalidColor")}
                >
                  <Input
                    dir="ltr"
                    value={value.accent}
                    onBlur={() => touch("accent")}
                    onChange={(event) => update("accent", event.target.value)}
                    spellCheck={false}
                  />
                </Field>
              </div>
              <input
                type="color"
                aria-label={t("pickColor")}
                className="h-11 w-11 cursor-pointer rounded-lg border bg-transparent p-1"
                value={colorValid ? value.accent : settings.accent}
                onChange={(event) => update("accent", event.target.value)}
              />
            </div>
            <Select
              value={value.cardDensity}
              onValueChange={(next) => {
                if (next === "compact" || next === "comfortable")
                  update("cardDensity", next);
              }}
            >
              <Field name="cardDensity" label={t("density")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </Field>
              <SelectContent>
                <SelectItem value="comfortable">{t("comfortable")}</SelectItem>
                <SelectItem value="compact">{t("compact")}</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <label className="check-field">
                <Switch
                  checked={value.glassEnabled}
                  onCheckedChange={(next) => update("glassEnabled", next)}
                />
                <span>{t("glass")}</span>
              </label>
              <p className="field-hint mt-2">{t("glassHint")}</p>
            </div>
          </section>
        </fieldset>
        <div className="form-actions">
          {draft.dirty && <span className="muted">{t("unsaved")}</span>}
          <Button
            type="button"
            variant="outline"
            disabled={!draft.dirty || mutation.isPending}
            onClick={() => {
              draft.reset();
              mutation.reset();
              setTouched({});
            }}
          >
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            disabled={
              !draft.dirty ||
              !titleValid ||
              !subtitleValid ||
              !colorValid ||
              mutation.isPending
            }
          >
            {mutation.isPending ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={reload}
        onOpenChange={setReload}
        title={t("reloadSettings")}
        description={t("reloadSettingsHint")}
        action={t("reloadSettings")}
        onConfirm={async () => {
          await queryClient.fetchQuery({
            queryKey: ["admin", "settings"],
            queryFn: api.settings,
            staleTime: 0,
          });
          draft.reset();
          mutation.reset();
          setTouched({});
        }}
      />
      {guard.dialog}
    </>
  );
}
function SecurityForm({ settings }: { settings: Settings }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const draft = useDraft(settingsInput(settings));
  const [reload, setReload] = useState(false);
  const [passwords, setPasswords] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const passwordForm = useRef<HTMLFormElement>(null);
  const guard = useUnsaved(
    draft.dirty || Object.values(passwords).some(Boolean),
  );
  const access = useMutation({
    mutationFn: api.saveSettings,
    onSuccess: async (saved) => {
      queryClient.setQueryData(["admin", "settings"], saved);
      draft.reset();
      await invalidateConfiguration();
      toast.success(t("accessSaved"));
    },
  });
  const password = useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) =>
      api.changePassword(current, next),
    gcTime: 0,
    onSuccess() {
      guard.allow();
      setPasswords({ current: "", next: "", confirm: "" });
      toast.success(t("passwordChanged"));
      navigate("/login?reason=password", { replace: true });
    },
  });
  const busy = access.isPending || password.isPending;
  const errors = {
    current: validPassword(passwords.current) ? "" : t("invalidPassword"),
    next: validPassword(passwords.next) ? "" : t("invalidPassword"),
    confirm: passwords.next === passwords.confirm ? "" : t("passwordsDiffer"),
  };
  const passwordValid = !Object.values(errors).some(Boolean);
  const updatePassword = (field: keyof typeof passwords, value: string) => {
    setPasswords((current) => ({ ...current, [field]: value }));
    password.reset();
  };
  return (
    <>
      <PageHeading title={t("security")} description={t("securityIntro")} />
      <div className="form-stack max-w-2xl">
        <form
          noValidate
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && draft.dirty) access.mutate(draft.value);
          }}
        >
          <fieldset disabled={busy} className="form-section">
            <h2>{t("accessMode")}</h2>
            {access.error && <ErrorState error={access.error} />}
            {access.error instanceof ApiError &&
              access.error.code === "REVISION_CONFLICT" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReload(true)}
                >
                  {t("reloadSettings")}
                </Button>
              )}
            <Select
              value={draft.value.accessMode}
              onValueChange={(next) => {
                if (next === "public" || next === "private") {
                  draft.update({ ...draft.value, accessMode: next });
                  access.reset();
                }
              }}
            >
              <Field name="accessMode" label={t("accessMode")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </Field>
              <SelectContent>
                <SelectItem value="public">{t("publicMode")}</SelectItem>
                <SelectItem value="private">{t("privateMode")}</SelectItem>
              </SelectContent>
            </Select>
            <p>
              {t(
                draft.value.accessMode === "public"
                  ? "publicHint"
                  : "privateHint",
              )}
            </p>
            <div className="form-actions">
              {draft.dirty && <span className="muted">{t("unsaved")}</span>}
              <Button
                type="button"
                variant="outline"
                disabled={!draft.dirty}
                onClick={() => {
                  draft.reset();
                  access.reset();
                }}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={!draft.dirty}>
                {access.isPending ? t("saving") : t("save")}
              </Button>
            </div>
          </fieldset>
        </form>
        <form
          ref={passwordForm}
          noValidate
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            setTouched({ current: true, next: true, confirm: true });
            if (!passwordValid) {
              requestAnimationFrame(() => {
                if (passwordForm.current) focusInvalid(passwordForm.current);
              });
              return;
            }
            password.mutate(passwords);
          }}
        >
          <fieldset disabled={busy} className="form-section">
            <h2>{t("changePassword")}</h2>
            <p className="notice">{t("passwordWarning")}</p>
            {password.error && (
              <ErrorState
                error={password.error}
                message={
                  password.error instanceof ApiError &&
                  password.error.status === 401
                    ? t("incorrectCurrentPassword")
                    : undefined
                }
              />
            )}
            <Field
              name="current"
              label={t("currentPassword")}
              error={touched.current ? errors.current : undefined}
            >
              <Input
                required
                type="password"
                value={passwords.current}
                autoComplete="current-password"
                onBlur={() =>
                  setTouched((current) => ({ ...current, current: true }))
                }
                onChange={(event) =>
                  updatePassword("current", event.target.value)
                }
              />
            </Field>
            <Field
              name="next"
              label={t("newPassword")}
              hint={t("passwordHint")}
              error={touched.next ? errors.next : undefined}
            >
              <Input
                required
                type="password"
                value={passwords.next}
                autoComplete="new-password"
                onBlur={() =>
                  setTouched((current) => ({ ...current, next: true }))
                }
                onChange={(event) => updatePassword("next", event.target.value)}
              />
            </Field>
            <Field
              name="confirm"
              label={t("confirmPassword")}
              error={touched.confirm ? errors.confirm : undefined}
            >
              <Input
                required
                type="password"
                value={passwords.confirm}
                autoComplete="new-password"
                onBlur={() =>
                  setTouched((current) => ({ ...current, confirm: true }))
                }
                onChange={(event) =>
                  updatePassword("confirm", event.target.value)
                }
              />
            </Field>
            <div className="form-actions">
              <Button
                type="button"
                variant="outline"
                disabled={!Object.values(passwords).some(Boolean)}
                onClick={() => {
                  setPasswords({ current: "", next: "", confirm: "" });
                  password.reset();
                  setTouched({});
                }}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={!passwordValid}>
                {password.isPending ? t("saving") : t("changePassword")}
              </Button>
            </div>
          </fieldset>
        </form>
      </div>
      <ConfirmDialog
        open={reload}
        onOpenChange={setReload}
        title={t("reloadSettings")}
        description={t("reloadSettingsHint")}
        action={t("reloadSettings")}
        onConfirm={async () => {
          await queryClient.fetchQuery({
            queryKey: ["admin", "settings"],
            queryFn: api.settings,
            staleTime: 0,
          });
          draft.reset();
          access.reset();
        }}
      />
      {guard.dialog}
    </>
  );
}
