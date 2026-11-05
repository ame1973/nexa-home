import {
  cloneElement,
  type ReactElement,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";
import { useBeforeUnload, useBlocker } from "react-router-dom";
import { AlertCircle, Loader2, X } from "lucide-react";
import { useI18n } from "@/app/preferences";
import { ApiError } from "@/lib/api/client";
import type { MessageKey } from "@/locales/en";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

const errorKeys: Record<string, MessageKey> = {
  COOKIE_BLOCKED: "cookieError",
  NETWORK_ERROR: "networkError",
  VALIDATION_ERROR: "invalidError",
  CONFLICT: "conflictError",
  REVISION_CONFLICT: "revisionError",
  FORBIDDEN: "forbiddenError",
  CSRF_INVALID: "csrfError",
  UNAUTHENTICATED: "unauthenticatedError",
  RATE_LIMITED: "rateError",
  LIMIT_EXCEEDED: "limitError",
  NOT_FOUND: "notFoundError",
  ORDER_PARTIAL: "orderPartial",
};
export function ErrorState({
  error,
  retry,
  message,
}: {
  error: unknown;
  retry?: () => void;
  message?: string;
}) {
  const { t } = useI18n();
  return (
    <div role="alert" className="error-state">
      <div className="flex items-center gap-2">
        <AlertCircle size={20} aria-hidden="true" />
        <strong>{t("errorTitle")}</strong>
      </div>
      <p>
        {message ??
          t(
            error instanceof ApiError
              ? (errorKeys[error.code] ?? "unexpectedError")
              : "unexpectedError",
          )}
      </p>
      {error instanceof ApiError && Object.keys(error.details).length > 0 && (
        <ul className="mb-4 list-inside list-disc text-sm">
          {Object.entries(error.details).map(([field, detail]) => (
            <li key={field}>
              <code>{field}</code>
              {typeof detail === "string" ? `: ${detail}` : ""}
            </li>
          ))}
        </ul>
      )}
      {error instanceof ApiError && error.requestId && (
        <p className="text-xs">
          {t("requestId")}: <code>{error.requestId}</code>
        </p>
      )}
      {retry && (
        <Button type="button" variant="outline" onClick={retry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}
export function Pending({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      className="flex min-h-32 items-center justify-center gap-3 text-muted-foreground"
    >
      <Loader2
        aria-hidden="true"
        size={20}
        className="motion-safe:animate-spin"
      />
      <span>{label ?? t("loading")}</span>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </section>
  );
}
export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1 tabIndex={-1} className="page-title">
          {title}
        </h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </header>
  );
}

type Control = {
  id?: string;
  name?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};
export function Field({
  name,
  label,
  hint,
  error,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactElement<Control>;
}) {
  const generated = useId();
  const id = `${name}-${generated}`;
  const described = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, {
        id,
        name,
        "aria-invalid": !!error,
        "aria-describedby": described || undefined,
      })}
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
export function focusInvalid(form: HTMLFormElement) {
  form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}
export function ModalContent({
  title,
  description,
  children,
  className = "",
  busy = false,
  focusAfter,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  busy?: boolean;
  focusAfter?: string;
}) {
  const { t } = useI18n();
  return (
    <DialogContent
      showCloseButton={false}
      aria-busy={busy}
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault();
      }}
      onCloseAutoFocus={(event) => {
        if (focusAfter) {
          event.preventDefault();
          document.getElementById(focusAfter)?.focus();
        }
      }}
      className={`sm:max-w-xl ${className}`}
    >
      <DialogHeader className="pe-12">
        <DialogTitle>{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : (
          <DialogDescription className="sr-only">{title}</DialogDescription>
        )}
      </DialogHeader>
      {children}
      <DialogClose asChild>
        <Button
          disabled={busy}
          variant="ghost"
          size="icon"
          className="absolute top-2 end-2"
          aria-label={t("close")}
        >
          <X aria-hidden="true" size={18} />
        </Button>
      </DialogClose>
    </DialogContent>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  action,
  cancel,
  focusAfter,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description: string;
  onConfirm(): Promise<void> | void;
  action?: string;
  cancel?: string;
  focusAfter?: string;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const previousFocus = useRef<HTMLElement | null>(null);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setError(undefined);
          onOpenChange(value);
        }
      }}
    >
      <AlertDialogContent
        aria-busy={pending}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onOpenAutoFocus={() => {
          previousFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target =
            (focusAfter ? document.getElementById(focusAfter) : null) ??
            (previousFocus.current?.isConnected
              ? previousFocus.current
              : document.getElementById("main"));
          target?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error !== undefined && <ErrorState error={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {cancel ?? t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              setPending(true);
              setError(undefined);
              void Promise.resolve()
                .then(onConfirm)
                .then(() => onOpenChange(false))
                .catch(setError)
                .finally(() => setPending(false));
            }}
          >
            {pending ? t("saving") : (action ?? t("delete"))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useUnsaved(dirty: boolean) {
  const { t } = useI18n();
  const saved = useRef(false);
  const blocker = useBlocker(() => dirty && !saved.current);
  useBeforeUnload((event) => {
    if (dirty && !saved.current) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  return {
    allow() {
      saved.current = true;
    },
    dialog: (
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
        title={t("unsavedTitle")}
        description={t("unsavedDescription")}
        action={t("discard")}
        cancel={t("keepEditing")}
        onConfirm={() => {
          if (blocker.state === "blocked") blocker.proceed();
        }}
      />
    ),
  };
}
