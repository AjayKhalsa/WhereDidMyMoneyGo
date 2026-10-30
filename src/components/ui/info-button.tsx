"use client";

import { useId, useState, type ReactNode } from "react";
import { Info, X } from "lucide-react";

/** Tap, keyboard and light-dismiss help; native popover keeps it out of layout. */
export function InfoButton({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-label={`About ${title}`}
        title={`About ${title}`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-tertiary transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Info aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <div
        id={id}
        popover="auto"
        onToggle={event => setOpen(event.currentTarget.matches(":popover-open"))}
        role="dialog"
        aria-labelledby={`${id}-title`}
        className="fixed inset-0 m-auto max-h-[75dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-sm leading-relaxed text-ink shadow-xl backdrop:bg-black/20"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={`${id}-title`} className="text-base font-semibold normal-case tracking-normal">{title}</h2>
          <button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label={`Close ${title}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-surface-sunken">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 text-sm font-normal normal-case tracking-normal text-ink-secondary">{open && children}</div>
      </div>
    </>
  );
}
