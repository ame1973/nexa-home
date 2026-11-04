import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";
import { queryClient } from "@/lib/api/client";

export function renderRoutes(routes: RouteObject[], path = "/") {
  localStorage.setItem("nexa.locale", "en");
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return {
    user: userEvent.setup(),
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}
