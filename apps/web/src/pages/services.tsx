import {
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  MoreHorizontal,
  Plus,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/app/preferences";
import {
  api,
  ApiError,
  invalidateConfiguration,
  type Service,
} from "@/lib/api/client";
import { serviceInput } from "@/lib/forms";
import { categoryIds, finishCategoryMove, moveId } from "@/lib/ordering";
import { filterServices, searchIndex } from "@/lib/search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  PageHeading,
  Pending,
} from "@/components/common";
import { ServiceIcon } from "@/components/service-tile";

type Move = {
  id: string;
  target: string | null;
  anchor?: string;
  focus?: string;
};
type PendingMove = {
  id: string;
  source: string | null;
  target: string | null;
  anchor?: string;
};
export function ServicesPage() {
  const { t, locale } = useI18n();
  const [params] = useSearchParams();
  const services = useQuery({
    queryKey: ["admin", "services"],
    queryFn: ({ signal }) => api.services(signal),
  });
  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: api.categories,
  });
  const tags = useQuery({ queryKey: ["admin", "tags"], queryFn: api.tags });
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [category, setCategory] = useState("all");
  const [tag, setTag] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [sort, setSort] = useState("manual");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const dragging = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [partial, setPartial] = useState<PendingMove | null>(null);
  const index = useMemo(
    () =>
      searchIndex({
        services: services.data ?? [],
        categories: categories.data ?? [],
        tags: tags.data ?? [],
      }),
    [services.data, categories.data, tags.data],
  );
  const rows = useMemo(() => {
    const result = filterServices(index, deferred).filter(
      (service) =>
        (category === "all" ||
          service.categoryId === (category === "none" ? null : category)) &&
        (tag === "all" || service.tagIds.includes(tag)) &&
        (visibility === "all" ||
          service.isVisible === (visibility === "visible")),
    );
    const ranks = new Map(
      categories.data?.map((item, index) => [item.id, index]),
    );
    const collator = new Intl.Collator(locale, {
      sensitivity: "base",
      numeric: true,
    });
    return result.sort((a, b) =>
      sort === "manual"
        ? (ranks.get(a.categoryId ?? "") ?? ranks.size) -
            (ranks.get(b.categoryId ?? "") ?? ranks.size) ||
          a.position - b.position ||
          a.id.localeCompare(b.id)
        : collator.compare(a.name, b.name) * (sort === "desc" ? -1 : 1) ||
          a.id.localeCompare(b.id),
    );
  }, [
    index,
    deferred,
    category,
    tag,
    visibility,
    sort,
    categories.data,
    locale,
  ]);
  const toggle = useMutation({
    mutationFn: async ({
      id,
      field,
      value,
    }: {
      id: string;
      field: "isFavorite" | "isVisible";
      value: boolean;
    }) => {
      const current = await api.service(id);
      return api.saveService({ ...serviceInput(current), [field]: value }, id);
    },
    onSuccess: async () => {
      await invalidateConfiguration();
      toast.success(t("serviceSaved"));
    },
  });
  const order = useMutation({
    mutationFn: async ({ id, target, anchor }: Move) => {
      const fresh = await api.services();
      const service = fresh.find((item) => item.id === id);
      if (!service) throw new ApiError(404, "NOT_FOUND");
      if (service.categoryId === target) {
        const ids = categoryIds(fresh, target);
        await api.reorderServices(
          target,
          anchor
            ? moveId(ids, id, anchor)
            : [...ids.filter((item) => item !== id), id],
        );
      } else {
        await api.saveService(
          { ...serviceInput(service), categoryId: target },
          id,
        );
        try {
          await finishCategoryMove(id, service.categoryId, target, anchor);
        } catch {
          setPartial({ id, source: service.categoryId, target, anchor });
          throw new ApiError(409, "ORDER_PARTIAL");
        }
      }
    },
    onSuccess: () => {
      toast.success(t("orderSaved"));
    },
    onSettled: async (_, _error, move) => {
      await invalidateConfiguration();
      if (move.focus)
        requestAnimationFrame(() => {
          const button = document.getElementById(move.focus!);
          if (button instanceof HTMLButtonElement && !button.disabled)
            button.focus();
          else document.getElementById(`service-menu-${move.id}`)?.focus();
        });
    },
  });
  const retryOrder = useMutation({
    mutationFn: async () => {
      if (partial)
        await finishCategoryMove(
          partial.id,
          partial.source,
          partial.target,
          partial.anchor,
        );
    },
    onSuccess: async () => {
      setPartial(null);
      order.reset();
      await invalidateConfiguration();
      toast.success(t("orderSaved"));
    },
  });
  const busy =
    toggle.isPending ||
    order.isPending ||
    retryOrder.isPending ||
    partial !== null;
  const canOrder =
    sort === "manual" &&
    query.trim() === "" &&
    tag === "all" &&
    visibility === "all" &&
    !busy;
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pages);
  const shown = rows.slice((currentPage - 1) * 50, currentPage * 50);
  const changeFilter = (set: (value: string) => void, value: string) => {
    set(value);
    setPage(1);
  };
  const retry = () => {
    void services.refetch();
    void categories.refetch();
    void tags.refetch();
  };
  if (services.isPending || categories.isPending || tags.isPending)
    return <Pending />;
  const readError = services.error ?? categories.error ?? tags.error;
  if (!services.data || !categories.data || !tags.data)
    return <ErrorState error={readError} retry={retry} />;
  const error = retryOrder.error ?? order.error ?? toggle.error;
  const drop = (event: DragEvent, target: string | null, anchor?: string) => {
    event.preventDefault();
    event.stopPropagation();
    const id = dragging.current;
    dragging.current = null;
    setDragOver(null);
    setIsDragging(false);
    if (canOrder && id && id !== anchor) order.mutate({ id, target, anchor });
  };
  const allowDrop = (event: DragEvent, id: string) => {
    if (canOrder && dragging.current) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragOver(id);
    }
  };
  return (
    <>
      <PageHeading
        title={t(params.get("view") === "services" ? "services" : "dashboard")}
        description={t("servicesIntro")}
      >
        <Button asChild>
          <Link id="add-service" to="/admin/services/new">
            <Plus size={18} aria-hidden="true" />
            {t("addService")}
          </Link>
        </Button>
      </PageHeading>
      {readError && <ErrorState error={readError} retry={retry} />}
      {error && <ErrorState error={error} />}
      {partial && (
        <div className="notice mb-5" role="status">
          <p>{t("orderPartial")}</p>
          <Button
            className="mt-3"
            disabled={retryOrder.isPending}
            onClick={() => retryOrder.mutate()}
          >
            {retryOrder.isPending ? t("saving") : t("retryOrder")}
          </Button>
        </div>
      )}
      <div className="table-tools">
        <Input
          type="search"
          aria-label={t("search")}
          placeholder={t("searchPlaceholder")}
          value={query}
          onChange={(event) => changeFilter(setQuery, event.target.value)}
        />
        <Select
          value={category}
          onValueChange={(value) => changeFilter(setCategory, value)}
        >
          <SelectTrigger aria-label={t("category")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allCategories")}</SelectItem>
            <SelectItem value="none">{t("uncategorized")}</SelectItem>
            {categories.data.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={tag}
          onValueChange={(value) => changeFilter(setTag, value)}
        >
          <SelectTrigger aria-label={t("tags")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allTags")}</SelectItem>
            {tags.data.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={visibility}
          onValueChange={(value) => changeFilter(setVisibility, value)}
        >
          <SelectTrigger aria-label={t("visible")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allVisibility")}</SelectItem>
            <SelectItem value="visible">{t("visible")}</SelectItem>
            <SelectItem value="hidden">{t("hidden")}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(value) => changeFilter(setSort, value)}
        >
          <SelectTrigger aria-label={t("sort")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">{t("manualOrder")}</SelectItem>
            <SelectItem value="asc">{t("nameAscending")}</SelectItem>
            <SelectItem value="desc">{t("nameDescending")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p role="status" aria-live="polite" className="muted mb-3">
        {t("totalServices", { count: rows.length })}
      </p>
      <p className="field-hint mb-4">{t("orderHint")}</p>
      {isDragging && (
        <div className="drop-scopes" aria-label={t("moveToCategory")}>
          {[
            ...categories.data.map((item) => ({
              id: item.id,
              name: item.name,
            })),
            { id: null, name: t("uncategorized") },
          ].map((item) => (
            <div
              key={item.id ?? "none"}
              className={`notice ${dragOver === `scope-${item.id}` ? "drag-over" : ""}`}
              onDragOver={(event) => allowDrop(event, `scope-${item.id}`)}
              onDrop={(event) => drop(event, item.id)}
            >
              {t("moveToCategory")}: {item.name}
            </div>
          ))}
        </div>
      )}
      {services.data.length === 0 ? (
        <EmptyState title={t("emptyHome")} description={t("emptyHomeHint")}>
          <Button asChild>
            <Link to="/admin/services/new">{t("addService")}</Link>
          </Button>
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title={t("noResults")} description={t("noResultsHint")}>
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              setCategory("all");
              setTag("all");
              setVisibility("all");
            }}
          >
            {t("clear")}
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="table-frame">
            <Table className="service-table" aria-label={t("services")}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t("name")}</TableHead>
                  <TableHead scope="col" className="desktop-column">
                    {t("category")}
                  </TableHead>
                  <TableHead scope="col" className="desktop-column">
                    {t("urlHost")}
                  </TableHead>
                  <TableHead scope="col" className="desktop-column">
                    {t("favorite")}
                  </TableHead>
                  <TableHead scope="col" className="desktop-column">
                    {t("visible")}
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    {t("actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((service) => {
                  const scope = categoryIds(services.data!, service.categoryId);
                  const index = scope.indexOf(service.id);
                  const categoryName =
                    categories.data?.find(
                      (item) => item.id === service.categoryId,
                    )?.name ?? t("uncategorized");
                  const primary =
                    service.links.find((link) => link.label === "primary")
                      ?.url ?? "";
                  let host = "";
                  try {
                    host = new URL(primary).host;
                  } catch {
                    /* Invalid legacy links are not made navigable here. */
                  }
                  const move = (direction: -1 | 1) => {
                    const anchor = scope[index + direction];
                    if (anchor)
                      order.mutate({
                        id: service.id,
                        target: service.categoryId,
                        anchor,
                        focus: `move-${direction}-${service.id}`,
                      });
                  };
                  const setFlag = (
                    field: "isFavorite" | "isVisible",
                    value: boolean,
                  ) => toggle.mutate({ id: service.id, field, value });
                  return (
                    <TableRow
                      key={service.id}
                      className={dragOver === service.id ? "drag-over" : ""}
                      onDragOver={(event) => allowDrop(event, service.id)}
                      onDrop={(event) =>
                        drop(event, service.categoryId, service.id)
                      }
                    >
                      <TableCell>
                        <div className="table-name">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="drag-handle"
                            aria-label={`${t("dragToReorder")}: ${service.name}`}
                            draggable={canOrder}
                            disabled={!canOrder}
                            onDragStart={(event) => {
                              dragging.current = service.id;
                              event.dataTransfer.setData(
                                "text/plain",
                                service.id,
                              );
                              event.dataTransfer.effectAllowed = "move";
                              setIsDragging(true);
                            }}
                            onDragEnd={() => {
                              dragging.current = null;
                              setDragOver(null);
                              setIsDragging(false);
                            }}
                          >
                            <GripVertical size={17} />
                          </Button>
                          <ServiceIcon service={service} />
                          <div>
                            <Link
                              to={`/admin/services/${service.id}`}
                              title={service.name}
                            >
                              {service.name}
                            </Link>
                            <span className="mobile-meta">
                              {categoryName}
                              {service.isFavorite ? ` / ${t("favorite")}` : ""}
                              {service.isVisible ? "" : ` / ${t("hidden")}`}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="desktop-column">
                        {categoryName}
                      </TableCell>
                      <TableCell className="desktop-column">
                        <span className="block max-w-40 truncate" title={host}>
                          {host}
                        </span>
                      </TableCell>
                      <TableCell className="desktop-column">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          aria-label={`${t("favorite")}: ${service.name}`}
                          aria-pressed={service.isFavorite}
                          onClick={() =>
                            setFlag("isFavorite", !service.isFavorite)
                          }
                        >
                          <Star
                            size={18}
                            aria-hidden="true"
                            className={service.isFavorite ? "text-primary" : ""}
                            fill={service.isFavorite ? "currentColor" : "none"}
                          />
                        </Button>
                      </TableCell>
                      <TableCell className="desktop-column">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          aria-label={`${t("visible")}: ${service.name}`}
                          aria-pressed={service.isVisible}
                          onClick={() =>
                            setFlag("isVisible", !service.isVisible)
                          }
                        >
                          {service.isVisible ? (
                            <Eye size={18} />
                          ) : (
                            <EyeOff size={18} />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="table-actions">
                          <Button
                            id={`move--1-${service.id}`}
                            variant="ghost"
                            size="icon"
                            aria-label={`${t("moveUp")}: ${service.name}`}
                            disabled={!canOrder || index <= 0}
                            onClick={() => move(-1)}
                          >
                            <ArrowUp size={17} />
                          </Button>
                          <Button
                            id={`move-1-${service.id}`}
                            variant="ghost"
                            size="icon"
                            aria-label={`${t("moveDown")}: ${service.name}`}
                            disabled={!canOrder || index === scope.length - 1}
                            onClick={() => move(1)}
                          >
                            <ArrowDown size={17} />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                id={`service-menu-${service.id}`}
                                variant="ghost"
                                size="icon"
                                disabled={busy}
                                aria-label={`${t("actions")}: ${service.name}`}
                              >
                                <MoreHorizontal size={19} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to={`/admin/services/${service.id}`}>
                                  {t("edit")}
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuCheckboxItem
                                checked={service.isFavorite}
                                onCheckedChange={(value) =>
                                  setFlag("isFavorite", value)
                                }
                              >
                                {t("favorite")}
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                checked={service.isVisible}
                                onCheckedChange={(value) =>
                                  setFlag("isVisible", value)
                                }
                              >
                                {t("visible")}
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setDeleting(service)}
                              >
                                {t("delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="pagination">
            <Button
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              {t("previous")}
            </Button>
            <span className="muted">
              {t("page", { page: currentPage, total: pages })}
            </span>
            <Button
              variant="outline"
              disabled={currentPage >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("deleteServiceTitle")}
        description={`${deleting?.name ?? ""}. ${t("deleteServiceDescription")}`}
        focusAfter="add-service"
        onConfirm={async () => {
          if (!deleting) return;
          await api.deleteService(deleting.id);
          await invalidateConfiguration();
          toast.success(t("serviceDeleted"));
        }}
      />
    </>
  );
}
