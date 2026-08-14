"use client";

import { ArrowDown, ArrowUp, ArrowLeftRight, Zap } from "lucide-react";
import { useAddSheet } from "@/components/add/add-sheet-provider";
import { cn } from "@/lib/utils";

/**
 * The always-present way to log something.
 *
 * A bare "+" asks you to remember what the app can do; this names it. The
 * three directions are the three things money actually does — it arrives, it
 * moves between your own accounts, or it leaves — which is the same
 * distinction the whole engine is built on (EXPENSE ≠ TRANSFER ≠ INCOME).
 * Choosing one here means the parser inherits a decision instead of guessing.
 *
 * Tapping the body opens the sheet with nothing preset, for the common case
 * where you'd rather just type "2400 dinner friends" and let it work it out.
 */

const DIRECTIONS = [
  {
    type: "INCOME",
    icon: ArrowDown,
    label: "Money in",
    tone: "text-positive",
  },
  {
    type: "TRANSFER",
    icon: ArrowLeftRight,
    label: "Move between accounts",
    tone: "text-ink-secondary",
  },
  {
    type: "EXPENSE",
    icon: ArrowUp,
    label: "Money out",
    tone: "text-ink",
  },
] as const;

export function QuickLogBar() {
  const { open } = useAddSheet();

  return (
    // Sits directly on top of the tab bar, whose items are h-16.
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-40 px-3 pb-2 lg:hidden">
      <div
        className={cn(
          "pointer-events-auto mx-auto flex max-w-md items-center gap-1",
          "rounded-2xl border border-line bg-surface/95 p-1.5 pl-3.5",
          "shadow-[var(--shadow-raised)] backdrop-blur-xl",
        )}
      >
        <button
          type="button"
          onClick={() => open()}
          className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left active:opacity-70"
        >
          <Zap className="h-4 w-4 shrink-0 text-ink-tertiary" strokeWidth={1.75} />
          <span className="min-w-0">
            <span className="block text-[14px] font-medium leading-tight text-ink">
              Log transaction
            </span>
            <span className="block truncate text-[12px] leading-tight text-ink-tertiary">
              Add, move, or use funds
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          {DIRECTIONS.map(({ type, icon: Icon, label, tone }) => (
            <button
              key={type}
              type="button"
              onClick={() => open({ initialType: type })}
              aria-label={label}
              title={label}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl",
                "transition-colors hover:bg-surface-sunken active:scale-90",
                tone,
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
