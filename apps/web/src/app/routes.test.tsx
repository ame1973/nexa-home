import { expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import axe from "axe-core";
import { routes } from "@/app/routes";
import { renderRoutes } from "@/test/render";
import { apiURL, denied, server } from "@/test/server";
import { csrf } from "@/test/fixtures";

it.each([
  ["/", "Good"],
  ["/login", "Sign in"],
  ["/setup", "Set up your home"],
  ["/admin", "Dashboard"],
  ["/admin/services/new", "New service"],
  ["/admin/categories", "Categories"],
  ["/admin/tags", "Tags"],
  ["/admin/appearance", "Appearance"],
  ["/admin/security", "Security"],
  ["/admin/backup", "Backup"],
  ["/missing-route", "This page is not here."],
])(
  "renders the real %s route with accessible semantics",
  async (path, heading) => {
    server.use(
      http.get(apiURL("/setup/status"), () =>
        HttpResponse.json({ initialized: path !== "/setup" }),
      ),
      http.get(apiURL("/auth/me"), () =>
        path.startsWith("/admin")
          ? HttpResponse.json({ username: "owner", csrfToken: csrf })
          : denied(),
      ),
    );
    const { user } = renderRoutes(routes, path);
    if (path === "/") await screen.findByRole("searchbox");
    else await screen.findByRole("heading", { name: heading });
    // jsdom cannot measure rendered color or responsive geometry; built-browser
    // checks cover contrast, target sizes, breakpoints, focus and production CSP.
    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      result.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((node) => node.target),
      })),
    ).toEqual([]);
    if (path === "/admin") {
      await user.click(
        screen.getByRole("button", { name: "Collapse navigation" }),
      );
      expect(
        screen.getByRole("button", { name: "Expand navigation" }),
      ).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByRole("link", { name: "Services" })).toBeVisible();
    }
  },
);
