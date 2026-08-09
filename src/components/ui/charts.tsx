"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Amount } from "./amount";
import type { BreakdownSlice } from "@/lib/engine/analytics";
import type { Paise } from "@/lib/domain/types";

/**
 * Charts, used sparingly (spec §48).
 *
 * There is no charting library here on purpose. Everything the product needs
 * is a horizontal bar, a progress track or a sparkline — three shapes that
 * answer a specific question and cost nothing to render. A donut chart of
 * spending categories would look busier and tell you less than a ranked list
 * of bars you can read top-to-bottom.
 *
 * Bars use one accent hue at graded opacity rather than a rainbow palette, so
 * rank is legible at a glance and the page stays calm.
 */

function barOpacity(index: number, count: number): number {
  if (count <= 1) return 0.9;
  const step = 0.62 / Math.max(1, count - 1);
  return Math.max(0.26, 0.88 - index * step);
}

export interface BarListProps {
  slices: BreakdownSlice[];
  /** Caps the number of rows; the rest collapse into "Other". */
  limit?: number;
  onSelect?: (slice: BreakdownSlice) => void;
  /** Shows count of transactions beside the amount. */
  showCount?: boolean;
  className?: string;
  emptyLabel?: string;
}

export function BarList({
  slices,
  limit,
  onSelect,
  showCount,
  className,
  emptyLabel = "Nothing here yet",
}: BarListProps) {
  if (slices.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-ink-tertiary">{emptyLabel}</p>
    );
  }

  const visible = limit ? slices.slice(0, limit) : slices;
  const max = Math.max(...visible.map((s) => s.amount), 1);

  return (
    <ul className={cn("space-y-0.5", className)}>
      {visible.map((slice, index) => {
        const width = Math.max(2, (slice.amount / max) * 100);
        const interactive = Boolean(onSelect);
        const Row = interactive ? "button" : "div";

        return (
          <li key={slice.id}>
            <Row
              {...(interactive
                ? {
                    type: "button" as const,
                    onClick: () => onSelect?.(slice),
                    "aria-label": `${slice.label}, ${slice.count} transactions`,
                  }
                : {})}
              className={cn(
                "group relative block w-full rounded-lg px-2.5 py-2 text-left",
                "transition-colors duration-150",
                interactive && "hover:bg-surface-hover",
              )}
            >
              <div className="relative z-10 flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium text-ink">
                  {slice.label}
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  {showCount && (
                    <span className="text-[12px] text-ink-tertiary tnum">
                      {slice.count}
                    </span>
                  )}
                  <Amount value={slice.amount} size="sm" />
                </span>
              </div>
              <div className="relative z-10 mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                <motion.div
                  className="h-full rounded-full bg-accent"
                  style={{ opacity: barOpacity(index, visible.length) }}
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{
                    duration: 0.5,
                    delay: Math.min(index * 0.035, 0.25),
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              </div>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A single proportional track, e.g. progress through the month or toward a
 * goal. Deliberately thin — it is context, not the headline.
 */
export function ProgressTrack({
  value,
  tone = "accent",
  className,
  height = "h-1.5",
  animate = true,
}: {
  /** 0–100. */
  value: number;
  tone?: "accent" | "positive" | "warning" | "danger" | "ink";
  className?: string;
  height?: string;
  animate?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const tones = {
    accent: "bg-accent",
    positive: "bg-positive",
    warning: "bg-warning",
    danger: "bg-danger",
    ink: "bg-ink",
  };

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-full bg-surface-sunken",
        height,
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className={cn("h-full rounded-full", tones[tone])}
        initial={animate ? { width: 0 } : false}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/**
 * A stacked proportional bar — the money-flow visual on the drill-down.
 * Each segment is labelled beneath rather than in a legend, because a legend
 * makes you look twice to read one number.
 */
export interface FlowSegment {
  id: string;
  label: string;
  amount: Paise;
  tone: "ink" | "accent" | "positive" | "warning" | "muted";
}

export function StackedFlowBar({
  segments,
  className,
}: {
  segments: FlowSegment[];
  className?: string;
}) {
  const total = segments.reduce((acc, s) => acc + Math.max(0, s.amount), 0);
  if (total <= 0) return null;

  const tones: Record<FlowSegment["tone"], string> = {
    ink: "bg-ink",
    accent: "bg-accent",
    positive: "bg-positive",
    warning: "bg-warning",
    muted: "bg-line-strong",
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-sunken">
        {segments.map((segment, index) => {
          const share = (Math.max(0, segment.amount) / total) * 100;
          if (share <= 0) return null;
          return (
            <motion.div
              key={segment.id}
              className={cn(tones[segment.tone], "h-full")}
              style={{ marginLeft: index === 0 ? 0 : 2 }}
              initial={{ width: 0 }}
              animate={{ width: `${share}%` }}
              transition={{
                duration: 0.55,
                delay: index * 0.06,
                ease: [0.22, 1, 0.36, 1],
              }}
              title={`${segment.label}: ${share.toFixed(1)}%`}
            />
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((segment) => {
          if (segment.amount <= 0) return null;
          return (
            <li key={segment.id} className="flex items-center gap-2">
              <span
                className={cn("h-2 w-2 shrink-0 rounded-full", tones[segment.tone])}
              />
              <span className="text-[13px] text-ink-secondary">
                {segment.label}
              </span>
              <Amount value={segment.amount} size="xs" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A minimal trend line. No axes, no gridlines, no legend — it exists to show
 * a shape, and any precise figure is stated in text beside it.
 */
export function Sparkline({
  values,
  className,
  height = 36,
  tone = "accent",
}: {
  values: number[];
  className?: string;
  height?: number;
  tone?: "accent" | "positive" | "warning";
}) {
  if (values.length < 2) return null;

  const width = 120;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values.map((value, index) => {
    const x = index * stepX;
    const y = height - ((value - min) / range) * (height - 6) - 3;
    return [x, y] as const;
  });

  const line = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  const strokes = {
    accent: "stroke-accent",
    positive: "stroke-positive",
    warning: "stroke-warning",
  };
  const fills = {
    accent: "fill-accent/8",
    positive: "fill-positive/8",
    warning: "fill-warning/8",
  };
  const last = points[points.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-9 w-[120px] overflow-visible", className)}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d={area} className={fills[tone]} stroke="none" />
      <path
        d={line}
        className={strokes[tone]}
        strokeWidth={1.75}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} className="fill-accent" />
    </svg>
  );
}

/** Circular score dial for the financial score. */
export function ScoreDial({
  score,
  size = 132,
  className,
}: {
  score: number;
  size?: number;
  className?: string;
}) {
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);

  const tone =
    clamped >= 75 ? "stroke-positive" : clamped >= 55 ? "stroke-accent" : "stroke-warning";

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-surface-sunken"
          strokeWidth={stroke}
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={tone}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="display-figure text-[2rem] font-semibold text-ink">
          {Math.round(clamped)}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
          out of 100
        </span>
      </div>
    </div>
  );
}
