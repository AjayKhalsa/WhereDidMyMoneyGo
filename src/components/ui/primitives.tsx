"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared surface, button and typography primitives.
 *
 * The visual language is deliberately narrow: one radius scale, one border
 * colour, two shadow depths. Screens are built by composing these rather than
 * by inventing new card styles, which is what keeps the app reading as a
 * single calm canvas instead of a pile of floating boxes.
 */

type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-canvas hover:bg-ink/90 active:bg-ink shadow-[var(--shadow-subtle)]",
  secondary:
    "bg-surface text-ink border border-line hover:bg-surface-hover hover:border-line-strong",
  ghost: "text-ink-secondary hover:text-ink hover:bg-surface-hover",
  quiet: "bg-surface-sunken text-ink hover:bg-surface-hover",
  danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "secondary", size = "md", block, className, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium",
          "transition-all duration-150 ease-[var(--ease-out-soft)]",
          "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
          VARIANTS[variant],
          SIZES[size],
          block && "w-full",
          className,
        )}
        {...props}
      />
    );
  },
);

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: ButtonVariant;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, variant = "ghost", className, ...props }, ref) {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          "transition-all duration-150 ease-[var(--ease-out-soft)] active:scale-95",
          "disabled:pointer-events-none disabled:opacity-40",
          VARIANTS[variant],
          className,
        )}
        {...props}
      />
    );
  },
);

/**
 * A raised surface. Used sparingly — most content sits directly on the canvas
 * and is separated by whitespace rather than by a border (spec §3).
 */
export function Card({
  className,
  children,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface",
        "shadow-[var(--shadow-subtle)]",
        interactive &&
          "transition-all duration-200 ease-[var(--ease-out-soft)] hover:border-line-strong hover:shadow-[var(--shadow-raised)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  className,
  description,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || action) && (
        <header className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-ink-secondary">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** A quiet text button used for "View all" style affordances. */
export function TextAction({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1 text-[13px] font-medium text-ink-secondary",
        "transition-colors duration-150 hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export type ChipTone = "neutral" | "accent" | "positive" | "warning" | "danger";

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "bg-surface-sunken text-ink-secondary",
  accent: "bg-accent-soft text-accent-ink",
  positive: "bg-positive-soft text-positive",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Chip({
  tone = "neutral",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-[3px]",
        "text-[12px] font-medium leading-none",
        CHIP_TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** Toggleable chip used by the category and context pickers. */
export function SelectableChip({
  selected,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5",
        "text-[13px] font-medium transition-all duration-150 ease-[var(--ease-out-soft)]",
        "active:scale-[0.97]",
        selected
          ? "border-ink bg-ink text-canvas"
          : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-surface-sunken",
        className,
      )}
    />
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-t border-line", className)} />;
}

/**
 * Empty states are treated as real screens, not placeholders — a new user's
 * first impression is an empty app, so it has to be useful (spec §36).
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)]",
        "border border-dashed border-line-strong bg-surface/50 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken text-ink-tertiary">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-ink-secondary">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
