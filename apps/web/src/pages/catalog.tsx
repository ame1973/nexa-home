import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/app/preferences";
import {
  api,
  ApiError,
  invalidateConfiguration,
  type Category,
  type CategoryInput,
  type Tag,
} from "@/lib/api/client";
import { useDraft, validText } from "@/lib/forms";
import { Icon, iconNames } from "@/lib/icons";
import { moveId } from "@/lib/ordering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  ModalContent,
  PageHeading,
  Pending,
  focusInvalid,
  useUnsaved,
} from "@/components/common";

type Item = Category | Tag;
type Kind = "categories" | "tags";
export function CategoriesPage() {
  return <CatalogPage kind="categories" />;
}
export function TagsPage() {
  return <CatalogPage kind="tags" />;
}
function CatalogPage({ kind }: { kind: Kind }) {
  const { t } = useI18n();
  const category = kind === "categories";
  const items = useQuery<Item[]>({
    queryKey: ["admin", kind],
    queryFn: async () => (category ? api.categories() : api.tags()),
  });
  const [editing, setEditing] = useState<Item | null>();
  const [deleting, setDeleting] = useState<Item | null>(null);
  const order = useMutation({
    mutationFn: async ({ id, anchor }: { id: string; anchor: string }) => {
      const fresh = await api.categories();
      const ids = fresh.map((item) => item.id);
      if (!ids.includes(id) || !ids.includes(anchor))
        throw new ApiError(409, "CONFLICT");
      await api.reorderCategories(moveId(ids, id, anchor));
    },
    onSettled: async (_, error, { id }) => {
      await invalidateConfiguration();
      if (!error) toast.success(t("orderSaved"));
      requestAnimationFrame(() =>
        document.getElementById(`edit-${id}`)?.focus(),
      );
    },
  });
  if (items.isPending) return <Pending />;
  if (!items.data)
    return (
      <ErrorState
        error={items.error}
        retry={() => {
          void items.refetch();
        }}
      />
    );
  return (
    <>
      <PageHeading
        title={t(kind)}
        description={t(category ? "categoriesIntro" : "tagsIntro")}
      >
        <Button id={`add-${kind}`} onClick={() => setEditing(null)}>
          <Plus size={18} aria-hidden="true" />
          {t(category ? "addCategory" : "addTag")}
        </Button>
      </PageHeading>
      {items.error && (
        <ErrorState
          error={items.error}
          retry={() => {
            void items.refetch();
          }}
        />
      )}
      {order.error && <ErrorState error={order.error} />}
      {items.data.length === 0 ? (
        <EmptyState
          title={t(category ? "noCategories" : "noTagsTitle")}
          description={t(category ? "noCategoriesHint" : "noTagsHint")}
        />
      ) : (
        <div className="table-frame">
          <Table className="catalog-table" aria-label={t(kind)}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t("name")}</TableHead>
                {category && (
                  <>
                    <TableHead scope="col" className="desktop-column">
                      {t("description")}
                    </TableHead>
                    <TableHead scope="col" className="desktop-column">
                      {t("visible")}
                    </TableHead>
                  </>
                )}
                <TableHead scope="col" className="text-right">
                  {t("actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.data.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="table-name">
                      {"icon" in item && (
                        <span className="desktop-column text-primary">
                          <Icon name={item.icon} size={22} />
                        </span>
                      )}
                      <div>
                        <span
                          className="block max-w-32 truncate font-medium"
                          title={item.name}
                        >
                          {item.name}
                        </span>
                        {"isVisible" in item && !item.isVisible && (
                          <span className="mobile-meta">{t("hidden")}</span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  {"description" in item && (
                    <>
                      <TableCell className="desktop-column">
                        <span
                          className="block max-w-64 truncate"
                          title={item.description}
                        >
                          {item.description}
                        </span>
                      </TableCell>
                      <TableCell className="desktop-column">
                        {t(item.isVisible ? "visible" : "hidden")}
                      </TableCell>
                    </>
                  )}
                  <TableCell>
                    <div className="table-actions">
                      {category && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={order.isPending || index === 0}
                            aria-label={`${t("moveUp")}: ${item.name}`}
                            onClick={() => {
                              const anchor = items.data[index - 1];
                              if (anchor)
                                order.mutate({
                                  id: item.id,
                                  anchor: anchor.id,
                                });
                            }}
                          >
                            <ArrowUp size={17} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={
                              order.isPending || index === items.data.length - 1
                            }
                            aria-label={`${t("moveDown")}: ${item.name}`}
                            onClick={() => {
                              const anchor = items.data[index + 1];
                              if (anchor)
                                order.mutate({
                                  id: item.id,
                                  anchor: anchor.id,
                                });
                            }}
                          >
                            <ArrowDown size={17} />
                          </Button>
                        </>
                      )}
                      <Button
                        id={`edit-${item.id}`}
                        variant="ghost"
                        size="icon"
                        disabled={order.isPending}
                        aria-label={`${t("edit")}: ${item.name}`}
                        onClick={() => setEditing(item)}
                      >
                        <Pencil size={17} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={order.isPending}
                        aria-label={`${t("delete")}: ${item.name}`}
                        onClick={() => setDeleting(item)}
                      >
                        <Trash2 size={17} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editing !== undefined && (
        <CatalogEditor
          key={editing?.id ?? "new"}
          kind={kind}
          original={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t(category ? "deleteCategoryTitle" : "deleteTagTitle")}
        description={`${deleting?.name ?? ""}. ${t(category ? "deleteCategoryDescription" : "deleteTagDescription")}`}
        focusAfter={`add-${kind}`}
        onConfirm={async () => {
          if (!deleting) return;
          if (category) await api.deleteCategory(deleting.id);
          else await api.deleteTag(deleting.id);
          await invalidateConfiguration();
          toast.success(t(category ? "categoryDeleted" : "tagDeleted"));
        }}
      />
    </>
  );
}
function CatalogEditor({
  kind,
  original,
  onClose,
}: {
  kind: Kind;
  original: Item | null;
  onClose(): void;
}) {
  const { t } = useI18n();
  const category = kind === "categories";
  const form = useRef<HTMLFormElement>(null);
  const source: CategoryInput = {
    name: original?.name ?? "",
    description:
      original && "description" in original ? original.description : "",
    icon: original && "icon" in original ? original.icon : "layout-grid",
    isVisible: original && "isVisible" in original ? original.isVisible : true,
  };
  const draft = useDraft(source);
  const value = draft.value;
  const guard = useUnsaved(draft.dirty);
  const [discard, setDiscard] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const nameValid = validText(value.name, 1, category ? 50 : 32);
  const descriptionValid = !category || validText(value.description, 0, 240);
  const mutation = useMutation({
    mutationFn: async (input: CategoryInput) =>
      category
        ? api.saveCategory(input, original?.id)
        : api.saveTag(input.name, original?.id),
    onSuccess: invalidateConfiguration,
  });
  const close = () => {
    if (mutation.isPending) return;
    if (draft.dirty) setDiscard(true);
    else onClose();
  };
  const update = <K extends keyof CategoryInput>(
    field: K,
    next: CategoryInput[K],
  ) => {
    draft.update({ ...value, [field]: next });
    mutation.reset();
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) return;
    setTouched({ name: true, description: true });
    if (!nameValid || !descriptionValid) {
      requestAnimationFrame(() => {
        if (form.current) focusInvalid(form.current);
      });
      return;
    }
    mutation.mutate(value, {
      onSuccess() {
        draft.reset();
        toast.success(t(category ? "categorySaved" : "tagSaved"));
        onClose();
      },
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <ModalContent
        title={t(
          category
            ? original
              ? "editCategory"
              : "addCategory"
            : original
              ? "editTag"
              : "addTag",
        )}
        busy={mutation.isPending}
        focusAfter={original ? `edit-${original.id}` : `add-${kind}`}
      >
        <form ref={form} noValidate onSubmit={submit} className="form-stack">
          {mutation.error && <ErrorState error={mutation.error} />}
          <fieldset disabled={mutation.isPending} className="form-stack">
            <Field
              name="name"
              label={t("name")}
              hint={t(category ? "categoryNameHint" : "tagNameHint")}
              error={
                touched.name && !nameValid
                  ? t("invalidName")
                  : mutation.error instanceof ApiError &&
                      typeof mutation.error.details.name === "string"
                    ? mutation.error.details.name
                    : undefined
              }
            >
              <Input
                required
                value={value.name}
                onBlur={() =>
                  setTouched((current) => ({ ...current, name: true }))
                }
                onChange={(event) => update("name", event.target.value)}
              />
            </Field>
            {category && (
              <>
                <Field
                  name="description"
                  label={t("description")}
                  hint={t("categoryDescriptionHint")}
                  error={
                    touched.description && !descriptionValid
                      ? t("invalidText")
                      : undefined
                  }
                >
                  <Textarea
                    rows={3}
                    value={value.description}
                    onBlur={() =>
                      setTouched((current) => ({
                        ...current,
                        description: true,
                      }))
                    }
                    onChange={(event) =>
                      update("description", event.target.value)
                    }
                  />
                </Field>
                <Select
                  value={value.icon}
                  onValueChange={(next) => update("icon", next)}
                >
                  <Field name="icon" label={t("icon")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </Field>
                  <SelectContent>
                    {iconNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        <Icon name={name} size={17} />
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="check-field">
                  <Switch
                    checked={value.isVisible}
                    onCheckedChange={(next) => update("isVisible", next)}
                  />
                  <span>{t("visible")}</span>
                </label>
              </>
            )}
          </fieldset>
          <div className="form-actions">
            {draft.dirty && <span className="muted">{t("unsaved")}</span>}
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={close}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                !draft.dirty ||
                !nameValid ||
                !descriptionValid ||
                mutation.isPending
              }
            >
              {mutation.isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </ModalContent>
      <ConfirmDialog
        open={discard}
        onOpenChange={setDiscard}
        title={t("unsavedTitle")}
        description={t("unsavedDescription")}
        action={t("discard")}
        cancel={t("keepEditing")}
        onConfirm={onClose}
      />
      {guard.dialog}
    </Dialog>
  );
}
