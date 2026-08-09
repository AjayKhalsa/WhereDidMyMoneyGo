"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  formatAmountOnly,
  formatDelta,
  formatMoney,
  formatMoneyCompact,
} from "@/lib/domain/money";
import type { Paise } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/**
 * Money display.
 *
 * Financial figures are the loudest thing on any screen, so they get their
 * own component: tabular numerals so digits never jitter as values change,
 * a smaller ₹ glyph so the number itself dominates, and tight tracking at
 * display sizes so a long figure still reads as one shape (spec §3).
 */

type AmountSize = "hero" | "xl" | "lg" | "md" | "sm" | "xs";

const SIZES: Record<AmountSize, { value: string; symbol: string }> = {
  hero: { value: "text-[clamp(2.75rem,9vw,4.25rem)] font-semibold", symbol: "text-[0.5em] font-medium" },
  xl: { value: "text-[clamp(1.75rem,5vw,2.25rem)] font-semibold", symbol: "text-[0.55em] font-medium" },
  lg: { value: "text-2xl font-semibold", symbol: "text-[0.6em] font-medium" },
  md: { value: "text-lg font-semibold", symbol: "text-[0.68em] font-medium" },
  sm: { value: "text-[15px] font-medium", symbol: "text-[0.8em]" },
  xs: { value: "text-[13px] font-medium", symbol: "text-[0.85em]" },
};

export function Amount({
  value,
  size = "md",
  className,
  compact,
  signed,
  muted,
}: {
  value: Paise;
  size?: AmountSize;
  className?: string;
  compact?: boolean;
  /** Renders a leading − for negative values instead of hiding the sign. */
  signed?: boolean;
  muted?: boolean;
}) {
  const style = SIZES[size];
  const negative = value < 0;
  const magnitude = Math.abs(value);

  if (compact) {
    return (
      <span className={cn("tnum", style.value, muted && "text-ink-secondary", className)}>
        {negative && signed ? "−" : ""}
        {formatMoneyCompact(magnitude)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-baseline",
        size === "hero" || size === "xl" ? "display-figure" : "tnum",
        style.value,
        muted && "text-ink-secondary",
        className,
      )}
    >
      {negative && signed && <span className="mr-0.5">−</span>}
      <span className={cn(style.symbol, "mr-[0.08em] opacity-60")}>₹</span>
      {formatAmountOnly(magnitude)}
    </span>
  );
}

/**
 * Counts up to the target value.
 *
 * Used only for the Home hero, where the animation communicates "this was
 * just calculated for you". Everywhere else numbers appear instantly —
 * animating every figure would be decoration, not feedback (spec §37).
 */
export function AnimatedAmount({
  value,
  size = "hero",
  className,
  duration = 750,
}: {
  value: Paise;
  size?: AmountSize;
  className?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number>(undefined);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }

    const start = performance.now();
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      // Ease-out cubic: fast to begin, settles gently on the final figure.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      fromRef.current = to;
    };
  }, [value, duration]);

  return <Amount value={display} size={size} className={className} signed />;
}

/**
 * A percentage change badge.
 * Note the deliberate inversion: for spending, *up* is the bad direction.
 */
export function DeltaBadge({
  percent,
  invert = true,
  className,
}: {
  percent: number | null;
  /** True when an increase is unwelcome (spending). False for income. */
  invert?: boolean;
  className?: string;
}) {
  const label = formatDelta(percent);
  if (label === null || percent === null) return null;

  const rising = percent > 0;
  const good = invert ? !rising : rising;
  const neutral = Math.round(percent) === 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-[2px] text-[12px] font-medium leading-none tnum",
        neutral
          ? "bg-surface-sunken text-ink-tertiary"
          : good
            ? "bg-positive-soft text-positive"
            : "bg-warning-soft text-warning",
        className,
      )}
    >
      {!neutral &&
        (rising ? (
          <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
        ) : (
          <ArrowDownRight className="h-3 w-3" strokeWidth={2.5} />
        ))}
      {label}
    </span>
  );
}

/** Small label + figure pair, used across the snapshot and detail rows. */
export function MetricPair({
  label,
  value,
  sub,
  className,
  size = "lg",
}: {
  label: string;
  value: Paise;
  sub?: string;
  className?: string;
  size?: AmountSize;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[13px] text-ink-secondary">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <Amount value={value} size={size} />
        {sub && <span className="text-[13px] text-ink-tertiary tnum">{sub}</span>}
      </div>
    </div>
  );
}

export { formatMoney };
