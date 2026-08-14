"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";

/**
 * Registers the service worker and, when a new version is waiting, offers to
 * load it rather than swapping code out mid-session.
 *
 * The alternative — `skipWaiting` on install — replaces the running app while
 * someone is halfway through typing an expense, which loses the entry. The
 * alternative to *that* is doing nothing, which leaves people pinned to a
 * cached old build indefinitely. So: ask.
 */
export function ServiceWorkerRegistrar() {
  const toast = useToast();
  // Guards against re-prompting when React re-runs the effect.
  const prompted = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;

    const promptToReload = (waiting: ServiceWorker) => {
      if (prompted.current) return;
      prompted.current = true;
      toast.show({
        tone: "info",
        title: "A new version is ready",
        detail: "Reload to pick it up. Nothing you've logged will be lost.",
        // Long enough to be a decision rather than a glimpse.
        duration: 15_000,
        action: {
          label: "Reload",
          onClick: () => waiting.postMessage({ type: "SKIP_WAITING" }),
        },
      });
    };

    // The new worker takes over only once it has been asked to; reload then
    // so the page and the worker are the same version.
    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        registration = reg;
        if (reg.waiting) promptToReload(reg.waiting);

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // "installed" with an existing controller means an update, not a
            // first install — only then is there anything to reload into.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              promptToReload(installing);
            }
          });
        });
      })
      .catch(() => {
        // A failed registration costs the user nothing — the app still works,
        // it just won't open offline. Not worth a visible error.
      });

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      void registration;
    };
  }, [toast]);

  return null;
}
