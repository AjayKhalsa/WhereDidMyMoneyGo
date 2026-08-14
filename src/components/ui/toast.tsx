"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, TriangleAlert } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { createId } from "@/lib/utils";

/**
 * Toasts.
 *
 * Confirmation after saving an expense is the whole point of this component:
 * you should be able to fire off "2400 dinner friends" and get back a small,
 * unmistakable "₹2,400 saved · Dining · Friends" without breaking stride.
 */

export type ToastTone = "success" | "info" | "error";

interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
  /**
   * Milliseconds on screen. Defaults to `DURATION`, which is tuned for a
   * confirmation you only need to glimpse. A toast carrying an `action` the
   * user is meant to *decide* on needs longer than a glance.
   */
  duration?: number;
}

interface ToastContextValue {
  show: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION = 3600;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = createId("toast");
      // Cap the stack — three is already more than anyone reads.
      setToasts((current) => [...current.slice(-2), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.duration ?? DURATION);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const TONES: Record<ToastTone, { icon: ReactNode; accent: string }> = {
  success: {
    icon: <Check className="h-3.5 w-3.5" strokeWidth={2.75} />,
    accent: "bg-positive text-white",
  },
  info: {
    icon: <Info className="h-3.5 w-3.5" strokeWidth={2.5} />,
    accent: "bg-ink text-canvas",
  },
  error: {
    icon: <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2.5} />,
    accent: "bg-danger text-white",
  },
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  // The portal has to wait for hydration to finish.
  // `typeof document === "undefined"` looks like the same guard, but it is
  // false on the client's *first* render — so the server sends nothing here
  // while the client immediately injects a div into <body>, and React reports
  // a hydration mismatch. Mounting on an effect keeps the first client render
  // identical to the server's.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4",
        // Clears the mobile tab bar; sits low-centre on desktop.
        "bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] sm:bottom-6",
      )}
      role="region"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-center gap-3",
              "rounded-xl border border-line bg-surface px-3.5 py-3",
              "shadow-[var(--shadow-overlay)]",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                TONES[toast.tone].accent,
              )}
            >
              {TONES[toast.tone].icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink">
                {toast.title}
              </p>
              {toast.detail && (
                <p className="truncate text-[12.5px] text-ink-secondary">
                  {toast.detail}
                </p>
              )}
            </div>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  onDismiss(toast.id);
                }}
                className="shrink-0 rounded-md px-2 py-1 text-[13px] font-medium text-accent-ink transition-colors hover:bg-accent-soft"
              >
                {toast.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside <ToastProvider>");
  return value;
}
