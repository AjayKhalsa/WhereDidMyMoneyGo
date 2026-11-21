"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Keep native disclosure behaviour without mounting hidden charts and lists. */
export function LazyDetails({ summary, children, className }: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className={cn("lazy-details", className)} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-medium">
        {summary}
        <ChevronDown aria-hidden="true" className="disclosure-chevron h-4 w-4 shrink-0 text-ink-tertiary" strokeWidth={1.75} />
      </summary>
      {open && <div className="pt-3">{children}</div>}
    </details>
  );
}
