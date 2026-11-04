import { Link, useLocation } from "react-router-dom";
import {
  Archive,
  Folder,
  LayoutDashboard,
  LayoutGrid,
  Palette,
  Shield,
  Tags,
} from "lucide-react";
import { useI18n } from "./preferences";
import type { MessageKey } from "@/locales/en";

const sections = [
  { to: "/admin", key: "dashboard", icon: LayoutDashboard },
  { to: "/admin?view=services", key: "services", icon: LayoutGrid },
  { to: "/admin/categories", key: "categories", icon: Folder },
  { to: "/admin/tags", key: "tags", icon: Tags },
  { to: "/admin/appearance", key: "appearance", icon: Palette },
  { to: "/admin/backup", key: "backup", icon: Archive },
  { to: "/admin/security", key: "security", icon: Shield },
] satisfies { to: string; key: MessageKey; icon: typeof LayoutGrid }[];

export function ManagementNavigation({
  onNavigate,
  compact = false,
}: {
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const location = useLocation();
  return (
    <nav aria-label={t("desktopNavigation")}>
      {sections.map(({ to, key, icon: Icon }) => {
        const active =
          key === "dashboard"
            ? location.pathname === "/admin" &&
              !location.search.includes("view=services")
            : key === "services"
              ? location.pathname.startsWith("/admin/services/") ||
                (location.pathname === "/admin" &&
                  location.search.includes("view=services"))
              : location.pathname === to;
        return (
          <Link
            key={key}
            to={to}
            onClick={onNavigate}
            className="nav-link"
            aria-current={active ? "page" : undefined}
            title={compact ? t(key) : undefined}
          >
            <Icon size={18} aria-hidden="true" />
            <span className={compact ? "sr-only" : undefined}>{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
