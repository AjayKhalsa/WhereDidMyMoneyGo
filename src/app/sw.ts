/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

/**
 * The app's service worker.
 *
 * Two rules govern what may be cached:
 *
 * 1. The app *shell* is cached aggressively, because the ledger already lives
 *    on the device in IndexedDB (`local-adapter.ts`). Cache the code and the
 *    whole app works with no network at all.
 * 2. Anything that speaks to a server is never cached. A stale balance is a
 *    wrong balance, and a replayed AI classification would attach last
 *    week's answer to this week's expense.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Never activate over a running session. The app prompts instead, so a new
  // deploy can't swap code out from under a half-filled transaction sheet.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Live data and auth, always. Supabase reads must never be served from
      // a cache, and /api/classify is a POST whose answer is specific to the
      // phrase just typed.
      matcher: ({ url }) =>
        url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/auth/") ||
        url.pathname === "/login" ||
        url.searchParams.has("code") ||
        url.hostname.endsWith(".supabase.co"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

// The page asks for the waiting worker to take over once the user accepts the
// "Reload" toast — see `service-worker-registrar.tsx`.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

serwist.addEventListeners();

// Generic alerts contain no balances, payees or private transaction details.
self.addEventListener("push", event => {
  let payload: { body?: string; tag?: string } = {};
  try { payload = event.data?.json() ?? {}; } catch { /* generic fallback */ }
  event.waitUntil(self.registration.showNotification("Where Did My Money Go", {
    body: payload.body ?? "Open Settings to check your Gmail sync.",
    tag: payload.tag ?? "wdmmg-sync",
    data: { url: "/settings" },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL("/settings", self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(url); await existing.focus(); }
    else await self.clients.openWindow(url);
  })());
});
