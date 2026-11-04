import type { RouteObject } from "react-router-dom";
import { AdminLayout, RootLayout } from "./root";
import { PreferencesProvider } from "./preferences";
import { Pending } from "@/components/common";
import { HomePage } from "@/pages/home";
import { FatalErrorPage, NotFoundPage } from "@/pages/not-found";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <FatalErrorPage />,
    hydrateFallbackElement: (
      <PreferencesProvider>
        <main id="main" className="page">
          <Pending />
        </main>
      </PreferencesProvider>
    ),
    children: [
      { index: true, element: <HomePage /> },
      {
        path: "setup",
        lazy: async () => ({
          Component: (await import("@/pages/auth")).SetupPage,
        }),
      },
      {
        path: "login",
        lazy: async () => ({
          Component: (await import("@/pages/auth")).LoginPage,
        }),
      },
      {
        path: "admin",
        element: <AdminLayout />,
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import("@/pages/services")).ServicesPage,
            }),
          },
          {
            path: "services/new",
            lazy: async () => ({
              Component: (await import("@/pages/service-editor"))
                .ServiceEditorPage,
            }),
          },
          {
            path: "services/:id",
            lazy: async () => ({
              Component: (await import("@/pages/service-editor"))
                .ServiceEditorPage,
            }),
          },
          {
            path: "categories",
            lazy: async () => ({
              Component: (await import("@/pages/catalog")).CategoriesPage,
            }),
          },
          {
            path: "tags",
            lazy: async () => ({
              Component: (await import("@/pages/catalog")).TagsPage,
            }),
          },
          {
            path: "appearance",
            lazy: async () => ({
              Component: (await import("@/pages/settings")).AppearancePage,
            }),
          },
          {
            path: "security",
            lazy: async () => ({
              Component: (await import("@/pages/settings")).SecurityPage,
            }),
          },
          {
            path: "backup",
            lazy: async () => ({
              Component: (await import("@/pages/backup")).BackupPage,
            }),
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
