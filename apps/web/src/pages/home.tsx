import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { Search, Star, X } from "lucide-react";
import { useAppData } from "@/app/root";
import { useI18n } from "@/app/preferences";
import { filterServices, searchIndex } from "@/lib/search";
import { api, type Service } from "@/lib/api/client";
import { Icon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/common";
import { ServiceTile } from "@/components/service-tile";

export function HomePage() {
  const { setup, bootstrap } = useAppData();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => api.health(signal),
    enabled: (bootstrap.data?.health.length ?? 0) > 0,
    staleTime: 0,
    refetchInterval: 15_000,
    retry: false,
  });
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const input = useRef<HTMLInputElement>(null);
  const index = useMemo(
    () => (bootstrap.data ? searchIndex(bootstrap.data) : []),
    [bootstrap.data],
  );
  const results = useMemo(
    () => filterServices(index, deferred),
    [index, deferred],
  );
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (document.querySelector('[role="dialog"],[role="alertdialog"]'))
        return;
      const typing = target?.closest(
        'input,textarea,select,[contenteditable="true"],[role="combobox"]',
      );
      if (
        (event.key === "/" &&
          !typing &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey) ||
        (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey))
      ) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  if (!setup.data?.initialized) return <Navigate to="/setup" replace />;
  if (bootstrap.isError)
    return (
      <main id="main" className="page">
        <ErrorState
          error={bootstrap.error}
          retry={() => {
            void bootstrap.refetch();
          }}
        />
      </main>
    );
  if (bootstrap.data === null) return <Navigate to="/login?next=%2F" replace />;
  if (!bootstrap.data)
    return (
      <main id="main" className="page" aria-busy="true">
        <div role="status" className="sr-only">
          {t("loading")}
        </div>
        <Skeleton className="mx-auto mb-12 h-24 max-w-xl" />
        <div className="service-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-40 rounded-2xl" />
          ))}
        </div>
      </main>
    );
  const data = bootstrap.data;
  const monitored = new Set(data.health.map((status) => status.serviceId));
  const latest =
    health.data && health.dataUpdatedAt >= bootstrap.dataUpdatedAt
      ? health.data
      : data.health;
  const statuses = new Map(
    latest
      .filter((status) => monitored.has(status.serviceId))
      .map((status) => [
        status.serviceId,
        health.isError || health.fetchStatus === "paused"
          ? { ...status, status: "unknown" as const }
          : status,
      ]),
  );
  const active = deferred.trim() !== "";
  const hour = new Date().getHours();
  const greeting =
    hour >= 5 && hour < 12
      ? "goodMorning"
      : hour >= 12 && hour < 18
        ? "goodAfternoon"
        : "goodEvening";
  const favorites = data.services.filter((service) => service.isFavorite);
  const groups = [
    ...data.categories.map((category) => ({
      id: category.id,
      name: category.name,
      icon: category.icon,
      services: data.services.filter(
        (service) => service.categoryId === category.id,
      ),
    })),
    {
      id: "other",
      name: t("other"),
      icon: "layout-grid",
      services: data.services.filter((service) => service.categoryId === null),
    },
  ];
  const grid = (services: Service[]) => (
    <div className="service-grid">
      {services.map((service) => (
        <ServiceTile
          key={service.id}
          service={service}
          health={statuses.get(service.id)}
          query={active ? deferred : ""}
        />
      ))}
    </div>
  );
  return (
    <main id="main" className="page">
      <section className="hero">
        <h1>{t(greeting)}</h1>
        <p dir="auto">{data.settings.siteSubtitle}</p>
        <div className="search-box glass">
          <Search size={21} aria-hidden="true" />
          <input
            ref={input}
            type="search"
            dir="auto"
            aria-label={t("search")}
            value={query}
            placeholder={t("searchPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setQuery("");
              }
            }}
          />
          {query ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("clear")}
              onClick={() => {
                setQuery("");
                input.current?.focus();
              }}
            >
              <X size={18} />
            </Button>
          ) : (
            <kbd className="shortcut" dir="ltr">Ctrl K /</kbd>
          )}
        </div>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="mt-4 text-sm"
        >
          {active
            ? t("searchResults", { count: results.length })
            : t("totalServices", { count: data.services.length })}
        </p>
      </section>
      {data.services.length === 0 ? (
        <EmptyState title={t("emptyHome")} description={t("emptyHomeHint")}>
          <Button asChild>
            <Link to="/admin">{t("addService")}</Link>
          </Button>
        </EmptyState>
      ) : active ? (
        results.length ? (
          <section
            className="collection"
            aria-label={t("searchResults", { count: results.length })}
          >
            <h2 className="sr-only">{t("search")}</h2>
            {grid(results)}
          </section>
        ) : (
          <EmptyState title={t("noResults")} description={t("noResultsHint")}>
            <Button variant="outline" onClick={() => setQuery("")}>
              {t("clear")}
            </Button>
          </EmptyState>
        )
      ) : (
        <>
          {favorites.length > 0 && (
            <section className="collection">
              <div className="collection-heading">
                <h2>
                  <Star size={18} aria-hidden="true" />
                  {t("favorites")}
                </h2>
                <span className="collection-count">{favorites.length}</span>
              </div>
              {grid(favorites)}
            </section>
          )}
          {groups
            .filter((group) => group.services.length > 0)
            .map((group) => (
              <section className="collection" key={group.id}>
                <div className="collection-heading">
                  <h2>
                    <Icon name={group.icon} size={18} />
                    <bdi>{group.name}</bdi>
                  </h2>
                  <span className="collection-count">
                    {group.services.length}
                  </span>
                </div>
                {grid(group.services)}
              </section>
            ))}
        </>
      )}
    </main>
  );
}
