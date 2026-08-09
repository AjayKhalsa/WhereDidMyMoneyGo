"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A collapsible section for the Money screen.
 *
 * Money holds six different kinds of financial structure. Showing them all at
 * once would be the "overwhelming admin dashboard" the product is explicitly
 * not meant to be, so each section states its headline figure in the header
 * and only unfolds when you want the detail (spec §42).
 */

export function DisclosurePanel({
  title,
  summary,
  defaultOpen = false,
  children,
  action,
}: {
  title: string;
  /** The one figure worth seeing without opening the section. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  /** Rendered inside the panel body, above the content. */
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className="border-b border-line last:border-b-0">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={contentId}
          className={cn(
            "flex w-full items-center justify-between gap-4 py-4 text-left",
            "transition-colors duration-150 hover:text-ink",
          )}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-ink-tertiary transition-transform duration-200 ease-[var(--ease-out-soft)]",
                open && "rotate-180",
              )}
              strokeWidth={1.9}
            />
            <span className="text-[15.5px] font-medium tracking-[-0.01em] text-ink">
              {title}
            </span>
          </span>
          {summary && <span className="shrink-0">{summary}</span>}
        </button>
      </h2>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={contentId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pb-6 pl-6.5">
              {action}
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** A plain row used inside the Money panels. */
export function MoneyRow({
  label,
  sublabel,
  value,
  meta,
  onClick,
  className,
}: {
  label: string;
  sublabel?: string;
  value: ReactNode;
  meta?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Element = onClick ? "button" : "div";
  return (
    <Element
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-xl px-3 py-2.5 text-left",
        onClick && "transition-colors duration-150 hover:bg-surface-hover",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-[14.5px] font-medium text-ink">
          {label}
        </span>
        {sublabel && (
          <span className="mt-0.5 block truncate text-[12.5px] text-ink-tertiary">
            {sublabel}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {meta}
        {value}
      </span>
    </Element>
  );
}
