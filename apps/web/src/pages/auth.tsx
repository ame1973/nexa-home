import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { House } from "lucide-react";
import { toast } from "sonner";
import { useAppData, useMe } from "@/app/root";
import { useI18n } from "@/app/preferences";
import { api, ApiError, queryClient } from "@/lib/api/client";
import { characters, safeNext, validPassword, validText } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState, Field, Pending, focusInvalid } from "@/components/common";

export function SetupPage() {
  const { t } = useI18n();
  const { setup } = useAppData();
  const navigate = useNavigate();
  const [values, setValues] = useState({
    token: "",
    username: "",
    password: "",
    confirm: "",
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const mutation = useMutation({ mutationFn: api.setup, gcTime: 0 });
  if (setup.data?.initialized) return <Navigate to="/login" replace />;
  const errors = {
    token: values.token.length >= 20 ? "" : t("invalidToken"),
    username:
      validText(values.username, 3, 40) &&
      values.username.trim() === values.username
        ? ""
        : t("invalidUsername"),
    password: validPassword(values.password) ? "" : t("invalidPassword"),
    confirm: values.confirm === values.password ? "" : t("passwordsDiffer"),
  };
  const valid = Object.values(errors).every((error) => !error);
  const update = (field: keyof typeof values, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    mutation.reset();
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched({ token: true, username: true, password: true, confirm: true });
    if (!valid) {
      const form = event.currentTarget;
      requestAnimationFrame(() => focusInvalid(form));
      return;
    }
    mutation.mutate(
      {
        token: values.token,
        username: values.username,
        password: values.password,
      },
      {
        onSuccess() {
          setValues({ token: "", username: "", password: "", confirm: "" });
          void queryClient.invalidateQueries({ queryKey: ["setup"] });
          toast.success(t("setupComplete"));
          navigate("/login", { replace: true });
        },
        onError(error) {
          if (error instanceof ApiError && error.code === "CONFLICT")
            void queryClient.invalidateQueries({ queryKey: ["setup"] });
        },
      },
    );
  };
  return (
    <main id="main" className="auth-shell">
      <div className="auth-card">
        <span className="brand-symbol">
          <House size={22} aria-hidden="true" />
        </span>
        <h1>{t("setup")}</h1>
        <p>{t("setupIntro")}</p>
        <form noValidate className="form-stack" onSubmit={submit}>
          {mutation.isError && (
            <ErrorState
              error={mutation.error}
              message={
                mutation.error instanceof ApiError &&
                mutation.error.code === "FORBIDDEN"
                  ? t("setupTokenInvalid")
                  : undefined
              }
            />
          )}
          <Field
            name="token"
            label={t("setupToken")}
            hint={t("setupTokenHint")}
            error={touched.token ? errors.token : undefined}
          >
            <Input
              type="password"
              value={values.token}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              disabled={mutation.isPending}
              onBlur={() => setTouched((value) => ({ ...value, token: true }))}
              onChange={(event) => update("token", event.target.value)}
            />
          </Field>
          <Field
            name="username"
            label={t("username")}
            hint={t("usernameHint")}
            error={touched.username ? errors.username : undefined}
          >
            <Input
              value={values.username}
              autoComplete="username"
              required
              disabled={mutation.isPending}
              onBlur={() =>
                setTouched((value) => ({ ...value, username: true }))
              }
              onChange={(event) => update("username", event.target.value)}
            />
          </Field>
          <Field
            name="password"
            label={t("password")}
            hint={t("passwordHint")}
            error={touched.password ? errors.password : undefined}
          >
            <Input
              type="password"
              value={values.password}
              autoComplete="new-password"
              required
              disabled={mutation.isPending}
              onBlur={() =>
                setTouched((value) => ({ ...value, password: true }))
              }
              onChange={(event) => update("password", event.target.value)}
            />
          </Field>
          <Field
            name="confirm"
            label={t("confirmPassword")}
            error={touched.confirm ? errors.confirm : undefined}
          >
            <Input
              type="password"
              value={values.confirm}
              autoComplete="new-password"
              required
              disabled={mutation.isPending}
              onBlur={() =>
                setTouched((value) => ({ ...value, confirm: true }))
              }
              onChange={(event) => update("confirm", event.target.value)}
            />
          </Field>
          <Button type="submit" disabled={!valid || mutation.isPending}>
            {mutation.isPending ? t("saving") : t("createAdmin")}
          </Button>
        </form>
      </div>
    </main>
  );
}

export function LoginPage() {
  const { t } = useI18n();
  const { setup } = useAppData();
  const me = useMe();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: ({
      username,
      password,
    }: {
      username: string;
      password: string;
    }) => api.login(username, password),
    gcTime: 0,
  });
  if (!setup.data?.initialized) return <Navigate to="/setup" replace />;
  if (me.isPending)
    return (
      <main id="main" className="auth-shell">
        <Pending />
      </main>
    );
  if (me.isError)
    return (
      <main id="main" className="auth-shell">
        <ErrorState
          error={me.error}
          retry={() => {
            void me.refetch();
          }}
        />
      </main>
    );
  if (me.data) return <Navigate to={safeNext(params.get("next"))} replace />;
  const valid =
    username.trim().length > 0 &&
    characters(username) <= 40 &&
    password.length > 0 &&
    characters(password) <= 128;
  return (
    <main id="main" className="auth-shell">
      <div className="auth-card">
        <span className="brand-symbol">
          <House size={22} aria-hidden="true" />
        </span>
        <h1>{t("signIn")}</h1>
        <p>{t("loginIntro")}</p>
        {params.get("reason") === "expired" && (
          <p role="status" className="notice mb-5">
            {t("expiredSession")}
          </p>
        )}
        {params.get("reason") === "password" && (
          <p role="status" className="notice mb-5">
            {t("passwordChanged")}
          </p>
        )}
        <form
          noValidate
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            mutation.mutate(
              { username, password },
              {
                onSuccess() {
                  setPassword("");
                  toast.success(t("loginSuccess"));
                  navigate(safeNext(params.get("next")), { replace: true });
                },
              },
            );
          }}
        >
          {mutation.isError && (
            <ErrorState
              error={mutation.error}
              message={
                mutation.error instanceof ApiError &&
                mutation.error.code === "UNAUTHENTICATED"
                  ? t("loginFailed")
                  : undefined
              }
            />
          )}
          <Field name="username" label={t("username")}>
            <Input
              value={username}
              autoComplete="username"
              required
              disabled={mutation.isPending}
              onChange={(event) => {
                setUsername(event.target.value);
                mutation.reset();
              }}
            />
          </Field>
          <Field name="password" label={t("password")}>
            <Input
              type="password"
              value={password}
              autoComplete="current-password"
              required
              disabled={mutation.isPending}
              onChange={(event) => {
                setPassword(event.target.value);
                mutation.reset();
              }}
            />
          </Field>
          <Button type="submit" disabled={!valid || mutation.isPending}>
            {mutation.isPending ? t("loading") : t("signIn")}
          </Button>
          <Button asChild variant="ghost">
            <Link to="/">{t("home")}</Link>
          </Button>
        </form>
      </div>
    </main>
  );
}
