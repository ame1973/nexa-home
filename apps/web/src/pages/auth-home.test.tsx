import { expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { routes } from "@/app/routes";
import { renderRoutes } from "@/test/render";
import { apiURL, denied, server } from "@/test/server";
import { bootstrap, csrf } from "@/test/fixtures";
import { queryClient } from "@/lib/api/client";

it("redirects first run to protected setup and validates without sending invalid data", async () => {
  let calls = 0;
  server.use(
    http.get(apiURL("/setup/status"), () =>
      HttpResponse.json({ initialized: false }),
    ),
    http.post(apiURL("/setup"), () => {
      calls++;
      return HttpResponse.json({ initialized: true }, { status: 201 });
    }),
  );
  const { user, router } = renderRoutes(routes);
  await screen.findByRole("heading", { name: "Set up your home" });
  expect(router.state.location.pathname).toBe("/setup");
  expect(
    screen.getByRole("button", { name: "Create administrator" }),
  ).toBeDisabled();
  const username = screen.getByLabelText("Username");
  await user.type(username, " x");
  await user.tab();
  expect(username).toHaveAttribute("aria-invalid", "true");
  expect(
    await screen.findByText(
      "Use 3–40 characters without surrounding whitespace.",
    ),
  ).toBeVisible();
  expect(calls).toBe(0);
});
it("submits the one-time token and clears setup secrets after creating the administrator", async () => {
  let initialized = false;
  server.use(
    http.get(apiURL("/setup/status"), () => HttpResponse.json({ initialized })),
    http.post(apiURL("/setup"), async ({ request }) => {
      expect(await request.json()).toEqual({
        token: "T".repeat(43),
        username: "owner",
        password: "a strong test password",
      });
      initialized = true;
      return HttpResponse.json({ initialized: true }, { status: 201 });
    }),
  );
  const { user, router } = renderRoutes(routes, "/setup");
  await user.type(
    await screen.findByLabelText("One-time setup token"),
    "T".repeat(43),
  );
  await user.type(screen.getByLabelText("Username"), "owner");
  await user.type(screen.getByLabelText("Password"), "a strong test password");
  await user.type(
    screen.getByLabelText("Confirm password"),
    "a strong test password",
  );
  await user.click(
    screen.getByRole("button", { name: "Create administrator" }),
  );
  await screen.findByRole("heading", { name: "Sign in" });
  expect(router.state.location.pathname).toBe("/login");
  expect(screen.getByLabelText("Password")).toHaveValue("");
  expect(localStorage.getItem("nexa.appearance")).not.toContain("password");
});
it("shows generic invalid credentials without navigation or private cache persistence", async () => {
  server.use(http.post(apiURL("/auth/login"), () => denied()));
  const { user, router } = renderRoutes(
    routes,
    "/login?next=https://external.example.test",
  );
  await user.type(await screen.findByLabelText("Username"), "unknown");
  await user.type(screen.getByLabelText("Password"), "incorrect password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(
    await screen.findByText("The username or password is incorrect."),
  ).toBeVisible();
  expect(router.state.location.pathname).toBe("/login");
  expect(queryClient.getQueryData(["me"])).toBeNull();
});
it("re-fetches private bootstrap after login so the return-to-home flow cannot redirect in a loop", async () => {
  let authenticated = false;
  server.use(
    http.get(apiURL("/public/bootstrap"), () =>
      authenticated
        ? HttpResponse.json({
            ...bootstrap,
            settings: { ...bootstrap.settings, accessMode: "private" },
          })
        : denied(),
    ),
    http.get(apiURL("/auth/me"), () =>
      authenticated
        ? HttpResponse.json({ username: "owner", csrfToken: csrf })
        : denied(),
    ),
    http.post(apiURL("/auth/login"), () => {
      authenticated = true;
      return HttpResponse.json({ csrfToken: csrf });
    }),
  );
  const { user, router } = renderRoutes(routes);
  await user.type(await screen.findByLabelText("Username"), "owner");
  await user.type(screen.getByLabelText("Password"), "a strong test password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("searchbox");
  expect(router.state.location.pathname).toBe("/");
  expect(
    screen.getAllByRole("link", { name: /Synology Photos/ })[0],
  ).toHaveAttribute("rel", "noopener noreferrer");
});
it("filters local text with safe highlights and supports search shortcuts and Escape", async () => {
  let requests = 0;
  server.use(
    http.get(apiURL("/public/bootstrap"), () => {
      requests++;
      return HttpResponse.json(bootstrap);
    }),
  );
  const { user } = renderRoutes(routes);
  const search = await screen.findByRole("searchbox");
  await user.keyboard("/");
  expect(search).toHaveFocus();
  await user.type(search, "家庭");
  await screen.findByText("1 results");
  expect(screen.getAllByRole("link", { name: /Synology Photos/ })).toHaveLength(
    1,
  );
  expect(
    screen.queryByRole("link", { name: /Jellyfin/ }),
  ).not.toBeInTheDocument();
  expect(document.querySelector("mark")?.textContent).toBe("家庭");
  await user.keyboard("{Escape}");
  await screen.findByText("6 services");
  await user.type(search, "[[<script>");
  expect(await screen.findByText("No matching services")).toBeVisible();
  expect(document.querySelector("script")).toBeNull();
  expect(requests).toBe(1);
});
it("localizes the full homepage without storing private names or URLs", async () => {
  const { user } = renderRoutes(routes);
  await screen.findByRole("searchbox");
  await user.click(screen.getByRole("button", { name: "Language" }));
  await user.click(screen.getByRole("menuitemradio", { name: "繁體中文" }));
  expect(await screen.findByRole("searchbox", { name: "搜尋" })).toBeVisible();
  expect(document.documentElement.lang).toBe("zh-Hant");
  expect(localStorage.getItem("nexa.locale")).toBe("zh-Hant");
  expect(JSON.stringify(localStorage)).not.toContain("Synology");
  expect(JSON.stringify(localStorage)).not.toContain("example.test");
});
it("guards management pages and reports initial failures with a retry action", async () => {
  const { router } = renderRoutes(routes, "/admin");
  await screen.findByRole("heading", { name: "Sign in" });
  expect(router.state.location.pathname).toBe("/login");
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Dashboard" }),
    ).not.toBeInTheDocument(),
  );
});
it("does not render an anonymous private homepage when bootstrap fails", async () => {
  server.use(
    http.get(apiURL("/public/bootstrap"), () => denied(500, "INTERNAL_ERROR")),
  );
  queryClient.setQueryDefaults(["bootstrap"], { retry: false });
  renderRoutes(routes);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The server could not complete this request.",
  );
  expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(screen.queryByText("Synology Photos")).not.toBeInTheDocument();
});
