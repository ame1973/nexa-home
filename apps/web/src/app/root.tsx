import { createContext, useContext, useEffect, useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import {
  Globe,
  House,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { api, queryClient, type Bootstrap } from "@/lib/api/client";
import { PreferencesProvider, useI18n, usePreferences } from "./preferences";
import { ManagementNavigation } from "./navigation";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ConfirmDialog, ErrorState, Pending } from "@/components/common";

const AppData = createContext<{
  setup: UseQueryResult<Awaited<ReturnType<typeof api.setupStatus>>, Error>;
  bootstrap: UseQueryResult<Bootstrap | null, Error>;
} | null>(null);
export function useAppData() {
  const value = useContext(AppData);
  if (!value) throw new Error("AppData provider is required");
  return value;
}
export function useMe(enabled = true) {
  return useQuery({
    queryKey: ["me"],
    queryFn: ({ signal }) => api.me(signal),
    enabled,
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}

export function RootLayout() {
  const setup = useQuery({
    queryKey: ["setup"],
    queryFn: api.setupStatus,
    staleTime: Infinity,
  });
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: ({ signal }) => api.bootstrap(signal),
    enabled: setup.data?.initialized === true,
  });
  return (
    <PreferencesProvider appearance={bootstrap.data?.settings}>
      <AppData value={{ setup, bootstrap }}>
        <TooltipProvider delayDuration={300}>
          <div className="app-background">
            <Chrome />
            {setup.isPending ? (
              <main id="main" className="page">
                <Pending />
              </main>
            ) : setup.isError ? (
              <main id="main" className="page">
                <ErrorState
                  error={setup.error}
                  retry={() => {
                    void setup.refetch();
                  }}
                />
              </main>
            ) : (
              <Outlet />
            )}
            <Footer />
            <Toaster closeButton />
          </div>
        </TooltipProvider>
      </AppData>
    </PreferencesProvider>
  );
}
function Footer() {
  const { t } = useI18n();
  return <footer className="site-footer">{t("footer")}</footer>;
}
function Chrome() {
  const { t } = useI18n();
  const preferences = usePreferences();
  const { bootstrap } = useAppData();
  const location = useLocation();
  useEffect(() => {
    document.title = bootstrap.data?.settings.siteTitle ?? "Nexa Home";
  }, [bootstrap.data?.settings.siteTitle]);
  useEffect(() => {
    const main = document.getElementById("main");
    main?.setAttribute("tabindex", "-1");
    main?.focus();
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const admin = location.pathname.startsWith("/admin");
  const me = useMe(admin);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logout, setLogout] = useState(false);
  const ThemeIcon = preferences.resolvedTheme === "dark" ? Moon : Sun;
  return (
    <>
      <a className="skip-link" href="#main">
        {t("skipContent")}
      </a>
      <header className="site-header glass">
        <div className="header-inner">
          <div className="flex min-w-0 items-center gap-2">
            {admin && me.data && (
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mobile-only"
                    aria-label={t("openMenu")}
                  >
                    <Menu size={20} />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" showCloseButton={false}>
                  <SheetHeader className="pr-14">
                    <SheetTitle>Nexa Home</SheetTitle>
                    <SheetDescription>{t("navigation")}</SheetDescription>
                  </SheetHeader>
                  <div className="mobile-navigation px-4">
                    <ManagementNavigation
                      onNavigate={() => setMenuOpen(false)}
                    />
                  </div>
                  <SheetClose asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2"
                      aria-label={t("close")}
                    >
                      <X size={18} />
                    </Button>
                  </SheetClose>
                </SheetContent>
              </Sheet>
            )}
            <Link to="/" className="brand">
              <span className="brand-symbol">
                <House size={21} aria-hidden="true" />
              </span>
              <span className="brand-name">
                {bootstrap.data?.settings.siteTitle ?? "Nexa Home"}
              </span>
            </Link>
          </div>
          <div className="header-actions">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t("language")}>
                  <Globe size={19} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={preferences.locale}
                  onValueChange={(value) => {
                    if (value === "en" || value === "zh-Hant")
                      preferences.setLocale(value);
                  }}
                >
                  <DropdownMenuRadioItem value="zh-Hant">
                    {t("traditionalChinese")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="en">
                    {t("english")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${t("theme")}: ${t(preferences.theme ?? "siteTheme")}`}
                >
                  <ThemeIcon size={20} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={preferences.theme ?? "site"}
                  onValueChange={(value) => {
                    if (value === "site") preferences.setTheme(null);
                    else if (
                      value === "dark" ||
                      value === "light" ||
                      value === "system"
                    )
                      preferences.setTheme(value);
                  }}
                >
                  {(["site", "dark", "light", "system"] as const).map(
                    (value) => (
                      <DropdownMenuRadioItem key={value} value={value}>
                        {t(value === "site" ? "siteTheme" : value)}
                      </DropdownMenuRadioItem>
                    ),
                  )}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {admin && me.data ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLogout(true)}
                aria-label={t("signOut")}
              >
                <LogOut size={19} />
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link to="/admin">
                  <Settings size={18} aria-hidden="true" />
                  <span className="header-label">{t("manage")}</span>
                  <span className="sr-only sm:not-sr-only sm:hidden">
                    {t("manage")}
                  </span>
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      <ConfirmDialog
        open={logout}
        onOpenChange={setLogout}
        title={t("signOutTitle")}
        description={t("signOutDescription")}
        action={t("signOut")}
        onConfirm={api.logout}
      />
    </>
  );
}

export function AdminLayout() {
  const { setup } = useAppData();
  const me = useMe();
  const location = useLocation();
  if (!setup.data?.initialized) return <Navigate to="/setup" replace />;
  if (me.isPending || (me.isFetching && me.data === undefined))
    return (
      <main id="main" className="page">
        <Pending />
      </main>
    );
  if (me.isError)
    return (
      <main id="main" className="page">
        <ErrorState
          error={me.error}
          retry={() => {
            void me.refetch();
          }}
        />
      </main>
    );
  if (!me.data) {
    const reason = queryClient.getQueryData(["session-expired"])
      ? "&reason=expired"
      : "";
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}${reason}`}
        replace
      />
    );
  }
  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <ManagementNavigation />
      </aside>
      <main id="main" className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
