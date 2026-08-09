"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { IconButton } from "./primitives";

/**
 * Overlay surfaces.
 *
 * One component covers both form factors: a bottom sheet you can thumb up on
 * mobile, a centred dialog on desktop. `variant="full"` takes the whole
 * viewport, which is what the "Where did my money go?" drill-down uses.
 *
 * Focus is trapped while open, Escape closes, and the body scroll is locked —
 * an overlay that lets the page scroll underneath feels broken on touch.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function useDialogBehaviour(
  open: boolean,
  onClose: () => void,
  ref: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow, paddingRight } = document.body.style;
    // Compensating for the scrollbar prevents the page jolting sideways.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    // Let the entry animation start before stealing focus.
    const focusTimer = window.setTimeout(() => {
      const target = ref.current?.querySelector<HTMLElement>(
        "[data-autofocus]",
      );
      (target ?? ref.current)?.focus();
    }, 60);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose, ref]);
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /** Sticky footer, typically the primary action. */
  footer?: ReactNode;
  variant?: "dialog" | "full";
  size?: "sm" | "md" | "lg";
  /** Hides the default header so the content can own the whole surface. */
  bare?: boolean;
}

const SIZES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-3xl",
};

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "dialog",
  size = "md",
  bare,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogBehaviour(open, onClose, panelRef);

  if (typeof document === "undefined") return null;

  const isFull = variant === "full";

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          role="presentation"
        >
          <motion.div
            className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={cn(
              "relative flex w-full flex-col bg-canvas outline-none",
              isFull
                ? "h-[100dvh] sm:h-[92vh] sm:max-w-4xl sm:rounded-[20px]"
                : cn(
                    "max-h-[92dvh] rounded-t-[20px] sm:rounded-[20px]",
                    SIZES[size],
                  ),
              "shadow-[var(--shadow-overlay)]",
            )}
            initial={{ y: "4%", opacity: 0, scale: 0.995 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: "3%", opacity: 0, scale: 0.995 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Grab handle — a touch affordance, hidden on pointer devices. */}
            {!isFull && (
              <div className="flex justify-center pt-2.5 sm:hidden">
                <div className="h-1 w-9 rounded-full bg-line-strong" />
              </div>
            )}

            {!bare && (
              <header
                className={cn(
                  "flex items-start justify-between gap-4 px-5 pb-3 pt-4 sm:px-6",
                  isFull && "border-b border-line",
                )}
              >
                <div className="min-w-0">
                  {title && (
                    <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="mt-0.5 text-[13px] text-ink-secondary">
                      {description}
                    </p>
                  )}
                </div>
                <IconButton
                  label="Close"
                  onClick={onClose}
                  className="-mr-1.5 -mt-1"
                >
                  <X className="h-4.5 w-4.5" strokeWidth={1.75} />
                </IconButton>
              </header>
            )}

            <div className="scroll-slim flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">
              {children}
            </div>

            {footer && (
              <div className="border-t border-line bg-surface/80 px-5 py-3.5 pb-safe backdrop-blur sm:px-6 sm:rounded-b-[20px]">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
