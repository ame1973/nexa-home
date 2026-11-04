import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useI18n } from "@/app/preferences";
import {
  api,
  ApiError,
  invalidateConfiguration,
  type Category,
  type Service,
  type ServiceInput,
  type Tag,
} from "@/lib/api/client";
import { isColor, serviceErrors, serviceInput, useDraft } from "@/lib/forms";
import { finishCategoryMove } from "@/lib/ordering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ErrorState,
  Field,
  PageHeading,
  Pending,
  focusInvalid,
  useUnsaved,
} from "@/components/common";
import { IconPicker } from "@/components/icon-picker";
import { ServiceTile } from "@/components/service-tile";

export function ServiceEditorPage() {
  const { id } = useParams();
  const service = useQuery({
    queryKey: ["admin", "service", id],
    queryFn: () => api.service(id!),
    enabled: !!id,
  });
  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: api.categories,
  });
  const tags = useQuery({ queryKey: ["admin", "tags"], queryFn: api.tags });
  const retry = () => {
    if (id) void service.refetch();
    void categories.refetch();
    void tags.refetch();
  };
  if ((id && service.isPending) || categories.isPending || tags.isPending)
    return <Pending />;
  const error = (id && service.error) || categories.error || tags.error;
  if (!categories.data || !tags.data || (id && !service.data))
    return <ErrorState error={error} retry={retry} />;
  return (
    <>
      {error && <ErrorState error={error} retry={retry} />}
      <ServiceForm
        key={id ?? "new"}
        original={service.data}
        categories={categories.data}
        tags={tags.data}
      />
    </>
  );
}
function ServiceForm({
  original,
  categories,
  tags,
}: {
  original?: Service;
  categories: Category[];
  tags: Tag[];
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const draft = useDraft(serviceInput(original));
  const value = draft.value;
  const guard = useUnsaved(draft.dirty);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [pendingMove, setPendingMove] = useState<{
    id: string;
    source: string | null;
    target: string | null;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: async (input: ServiceInput) => {
      const saved = await api.saveService(input, original?.id);
      if (original && original.categoryId !== saved.categoryId) {
        try {
          await finishCategoryMove(
            saved.id,
            original.categoryId,
            saved.categoryId,
          );
        } catch (error) {
          setPendingMove({
            id: saved.id,
            source: original.categoryId,
            target: saved.categoryId,
          });
          await invalidateConfiguration();
          throw error instanceof ApiError && error.status === 401
            ? error
            : new ApiError(409, "ORDER_PARTIAL");
        }
      }
      return saved;
    },
    onSuccess: invalidateConfiguration,
  });
  const retry = useMutation({
    mutationFn: async () => {
      if (pendingMove)
        await finishCategoryMove(
          pendingMove.id,
          pendingMove.source,
          pendingMove.target,
        );
    },
    onSuccess: invalidateConfiguration,
  });
  const busy = mutation.isPending || retry.isPending;
  const errors = serviceErrors(value);
  const error = retry.error ?? mutation.error;
  const errorFor = (name: string) => {
    const own = errors[name];
    if (own && (submitted || touched[name])) return t(own);
    if (error instanceof ApiError) {
      const index = value.links.findIndex((link) => link.label === name);
      const detail = error.details[index >= 0 ? `links.${index}.url` : name];
      if (typeof detail === "string") return detail;
    }
    return undefined;
  };
  const touch = (name: string) =>
    setTouched((current) => ({ ...current, [name]: true }));
  const update = <K extends keyof ServiceInput>(
    name: K,
    next: ServiceInput[K],
  ) => {
    draft.update({ ...value, [name]: next });
    mutation.reset();
  };
  const complete = () => {
    guard.allow();
    draft.reset();
    toast.success(t("serviceSaved"));
    navigate("/admin?view=services");
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || pendingMove) return;
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      requestAnimationFrame(() => {
        if (formRef.current) focusInvalid(formRef.current);
      });
      return;
    }
    mutation.mutate(value, {
      onSuccess: complete,
      onError() {
        requestAnimationFrame(() => {
          if (formRef.current) focusInvalid(formRef.current);
        });
      },
    });
  };
  return (
    <>
      <PageHeading
        title={t(original ? "editService" : "newService")}
        description={t("servicesIntro")}
      >
        <Button asChild variant="outline">
          <Link to="/admin?view=services">{t("back")}</Link>
        </Button>
      </PageHeading>
      {error && <ErrorState error={error} />}
      {pendingMove && (
        <div role="status" className="notice mb-6">
          <p>{t("orderPartial")}</p>
          <Button
            type="button"
            className="mt-3"
            disabled={busy}
            onClick={() => retry.mutate(undefined, { onSuccess: complete })}
          >
            {busy ? t("saving") : t("retryOrder")}
          </Button>
        </div>
      )}
      <div className="editor-grid">
        <aside className="preview-pane" aria-label={t("preview")}>
          <h2 className="mb-3 text-base text-muted-foreground">
            {t("preview")}
          </h2>
          <ServiceTile service={value} preview />
          <p className="field-hint mt-3">{t("previewHint")}</p>
        </aside>
        <form
          ref={formRef}
          noValidate
          onSubmit={submit}
          className="editor-fields"
        >
          <fieldset
            disabled={busy || pendingMove !== null}
            className="form-stack min-w-0"
            aria-busy={busy}
          >
            <section className="form-section">
              <h2>{t("basics")}</h2>
              <Field
                name="name"
                label={t("name")}
                hint={t("nameHint")}
                error={errorFor("name")}
              >
                <Input
                  value={value.name}
                  required
                  onBlur={() => touch("name")}
                  onChange={(event) => update("name", event.target.value)}
                />
              </Field>
              <Field
                name="description"
                label={t("description")}
                hint={t("descriptionHint")}
                error={errorFor("description")}
              >
                <Textarea
                  value={value.description}
                  rows={3}
                  onBlur={() => touch("description")}
                  onChange={(event) =>
                    update("description", event.target.value)
                  }
                />
              </Field>
            </section>
            <section className="form-section">
              <h2>{t("links")}</h2>
              {(
                [
                  { label: "primary", key: "primaryUrl" },
                  { label: "lan", key: "lanUrl" },
                  { label: "wan", key: "wanUrl" },
                ] as const
              ).map(({ label, key }) => (
                <Field
                  key={label}
                  name={label}
                  label={t(key)}
                  error={errorFor(label)}
                >
                  <Input
                    type="url"
                    value={
                      value.links.find((link) => link.label === label)?.url ??
                      ""
                    }
                    required={label === "primary"}
                    inputMode="url"
                    autoCapitalize="none"
                    spellCheck={false}
                    onBlur={() => touch(label)}
                    onChange={(event) => {
                      const links = value.links.filter(
                        (link) => link.label !== label,
                      );
                      if (event.target.value !== "" || label === "primary")
                        links.push({ label, url: event.target.value });
                      links.sort(
                        (a, b) =>
                          ["primary", "lan", "wan"].indexOf(a.label) -
                          ["primary", "lan", "wan"].indexOf(b.label),
                      );
                      update("links", links);
                    }}
                  />
                </Field>
              ))}
              <p className="field-hint">{t("secondaryLinksHint")}</p>
            </section>
            <section className="form-section">
              <h2>{t("icon")}</h2>
              <IconPicker
                value={value}
                onChange={(choice) => {
                  draft.update({ ...value, ...choice });
                  mutation.reset();
                }}
              />
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <Field
                    name="color"
                    label={t("color")}
                    error={errorFor("color")}
                  >
                    <Input
                      value={value.color}
                      onBlur={() => touch("color")}
                      spellCheck={false}
                      onChange={(event) => update("color", event.target.value)}
                    />
                  </Field>
                </div>
                <input
                  type="color"
                  aria-label={t("pickColor")}
                  className="h-11 w-11 cursor-pointer rounded-lg border bg-transparent p-1"
                  value={isColor(value.color) ? value.color : "#405B82"}
                  onChange={(event) => update("color", event.target.value)}
                />
              </div>
            </section>
            <section className="form-section">
              <h2>{t("classification")}</h2>
              <Select
                value={value.categoryId ?? "none"}
                onValueChange={(next) =>
                  update("categoryId", next === "none" ? null : next)
                }
              >
                <Field
                  name="categoryId"
                  label={t("category")}
                  error={errorFor("categoryId")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </Field>
                <SelectContent>
                  <SelectItem value="none">{t("uncategorized")}</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                      {category.isVisible ? "" : ` (${t("hidden")})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="field">
                <Label>{t("tags")}</Label>
                <p className="field-hint">{t("tagHint")}</p>
                {tags.length ? (
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {tags.map((tag) => (
                      <label key={tag.id} className="check-field">
                        <Checkbox
                          checked={value.tagIds.includes(tag.id)}
                          disabled={
                            !value.tagIds.includes(tag.id) &&
                            value.tagIds.length >= 20
                          }
                          onCheckedChange={(checked) =>
                            update(
                              "tagIds",
                              (checked
                                ? [...value.tagIds, tag.id]
                                : value.tagIds.filter((id) => id !== tag.id)
                              ).sort(),
                            )
                          }
                        />
                        <span>{tag.name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="field-hint">{t("noTags")}</p>
                )}
              </div>
            </section>
            <section className="form-section">
              <h2>{t("behavior")}</h2>
              <Select
                value={value.openMode}
                onValueChange={(next) => {
                  if (next === "new_tab" || next === "same_tab")
                    update("openMode", next);
                }}
              >
                <Field name="openMode" label={t("openMode")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </Field>
                <SelectContent>
                  <SelectItem value="new_tab">{t("newTabOption")}</SelectItem>
                  <SelectItem value="same_tab">{t("sameTabOption")}</SelectItem>
                </SelectContent>
              </Select>
              <label className="check-field">
                <Switch
                  checked={value.isFavorite}
                  onCheckedChange={(checked) => update("isFavorite", checked)}
                />
                <span>{t("favorite")}</span>
              </label>
              <label className="check-field">
                <Switch
                  checked={value.isVisible}
                  onCheckedChange={(checked) => update("isVisible", checked)}
                />
                <span>{t("visible")}</span>
              </label>
            </section>
          </fieldset>
          <div className="form-actions">
            {draft.dirty && <span className="muted">{t("unsaved")}</span>}
            <Button asChild variant="outline">
              <Link to="/admin?view=services">{t("cancel")}</Link>
            </Button>
            <Button
              type="submit"
              disabled={
                Object.keys(errors).length > 0 || busy || pendingMove !== null
              }
            >
              {busy ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </div>
      {guard.dialog}
    </>
  );
}
