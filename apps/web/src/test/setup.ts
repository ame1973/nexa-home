import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import {
  fetch as nativeFetch,
  FormData as NodeFormData,
  Request as NodeRequest,
  Response as NodeResponse,
  Headers as NodeHeaders,
} from "undici";
import { server } from "./server";

// Keep multipart bodies on the same native Web API implementation as Node fetch;
// jsdom's File lacks Blob.stream(), which otherwise aborts valid upload tests.
vi.stubGlobal("Blob", NodeBlob);
vi.stubGlobal("File", NodeFile);
vi.stubGlobal("FormData", NodeFormData);
vi.stubGlobal("Request", NodeRequest);
vi.stubGlobal("Response", NodeResponse);
vi.stubGlobal("Headers", NodeHeaders);
vi.stubGlobal("fetch", nativeFetch);
// jsdom has no layout engine; real size and responsive behavior are browser-tested.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
const { clearSession, queryClient } = await import("@/lib/api/client");
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
if (!window.PointerEvent)
  window.PointerEvent = MouseEvent as typeof PointerEvent;
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = () => undefined;
HTMLElement.prototype.releasePointerCapture = () => undefined;
HTMLElement.prototype.scrollIntoView = () => undefined;
window.scrollTo = () => undefined;
// @ts-expect-error The pre-paint bootstrap is intentionally a non-module browser script.
await import("../../public/theme-init.js");
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(async () => {
  cleanup();
  await clearSession();
  queryClient.clear();
  server.resetHandlers();
  localStorage.clear();
  vi.restoreAllMocks();
  window.NexaTheme.apply({}, "dark", null);
});
afterAll(() => server.close());
