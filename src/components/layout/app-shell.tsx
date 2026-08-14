"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Settings } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { isActivePath, NAV_ITEMS } from "./navigation";
import { useAddSheet } from "@/components/add/add-sheet-provider";
import { QuickLogBar } from "./quick-log-bar";
import type { ReactNode } from "react";

/**
 * Responsive application shell.
 *
 * Desktop gets a compact icon-and-label sidebar with a persistent Add button.
 * Mobile gets a bottom bar with Add raised into the middle, reachable with a
 * thumb — because the product only works if recording an expense takes three
 * seconds one-handed (spec §49).
 *
 * This is not a compressed desktop layout: the two navigations are different
 * components with different ergonomics, sharing only the route list.
 */

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The login form is not "the app" yet — no nav to a screen you can't
  // reach, no persistent Add button for data that isn't loaded.
  if (pathname === "/login") {
    return <div className="min-h-[100dvh] bg-canvas">{children}</div>;
  }

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <DesktopSidebar />
      <div className="lg:pl-[236px]">
        <main
          id="main"
          className={cn(
            "mx-auto w-full max-w-[1120px] px-5 sm:px-8",
            "pt-6 sm:pt-8",
            // Clears the mobile tab bar *and* the quick-log bar above it.
            "pb-[calc(9.5rem+env(safe-area-inset-bottom,0px))] lg:pb-16",
          )}
        >
          {children}
        </main>
      </div>
      <QuickLogBar />
      <MobileTabBar />
    </div>
  );
}

function DesktopSidebar() {
  const pathname = usePathname();
  const { open } = useAddSheet();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col lg:flex",
        "border-r border-line bg-surface/60 backdrop-blur-sm",
      )}
    >
      <div className="px-6 pb-6 pt-7">
        <Link href="/" className="group block">
          <p className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
            Where did my money go
          </p>
          <p className="mt-0.5 text-[12px] text-ink-tertiary">
            Personal money assistant
          </p>
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 px-3">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-xl px-3 py-2.5",
                    "text-[14px] font-medium transition-colors duration-150",
                    active
                      ? "text-ink"
                      : "text-ink-secondary hover:bg-surface-hover hover:text-ink",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="sidebar-active"
                      className="absolute inset-0 rounded-xl bg-surface-sunken"
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )}
                  <Icon
                    className="relative z-10 h-[18px] w-[18px]"
                    strokeWidth={active ? 2.1 : 1.75}
                  />
                  <span className="relative z-10">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 px-1">
          <button
            type="button"
            onClick={() => open()}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5",
              "text-[14px] font-medium text-canvas shadow-[var(--shadow-subtle)]",
              "transition-all duration-150 ease-[var(--ease-out-soft)]",
              "hover:bg-ink/90 active:scale-[0.98]",
            )}
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} />
            Add
          </button>
        </div>
      </nav>

      <div className="px-3 pb-5">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium",
            "transition-colors duration-150",
            isActivePath(pathname, "/settings")
              ? "bg-surface-sunken text-ink"
              : "text-ink-tertiary hover:bg-surface-hover hover:text-ink",
          )}
        >
          <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
          Settings
        </Link>
      </div>
    </aside>
  );
}

function MobileTabBar() {
  const pathname = usePathname();

  // No raised "+" here any more: the quick-log bar sits directly above and
  // says what it does, so a second, vaguer route to the same sheet only took
  // space the tabs could use.
  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 lg:hidden",
        "border-t border-line bg-surface/85 backdrop-blur-xl",
        "pb-safe",
      )}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2">
        {NAV_ITEMS.map((item) => (
          <TabItem key={item.href} item={item} pathname={pathname} />
        ))}
      </ul>
    </nav>
  );
}

function TabItem({
  item,
  pathname,
}: {
  item: (typeof NAV_ITEMS)[number];
  pathname: string;
}) {
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;

  return (
    <li className="flex-1">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-16 flex-col items-center justify-center gap-1 rounded-xl",
          "text-[11px] font-medium transition-colors duration-150",
          active ? "text-ink" : "text-ink-tertiary",
        )}
      >
        <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.1 : 1.7} />
        {item.label}
      </Link>
    </li>
  );
}
