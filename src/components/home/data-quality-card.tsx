"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/data/supabase-client";
import { useFinance } from "@/lib/hooks/use-finance";
import { dataQuality } from "@/lib/engine/data-quality";
import { indiaNow } from "@/lib/domain/transaction-time";
import { Amount } from "@/components/ui/amount";

interface SyncStatus {
  configured: boolean;
  connection?: { last_synced_at?: string | null } | null;
  reviewCount?: number;
  financialReviewCount?: number;
  categoryReviewCount?: number;
  health?: { state: string; pending: number };
}

function syncLabel(sync: SyncStatus | undefined, failed: boolean): string {
  if (failed) return "Sync status unavailable — freshness is unverified.";
  if (!sync) return "Checking email status…";
  if (!sync.configured || !sync.connection) return "Gmail is not connected.";
  switch (sync.health?.state) {
    case "error": return "Email sync needs attention.";
    case "incomplete": return `Email processing incomplete · ${sync.health.pending} queued.`;
    case "stale": return "Mailbox checks are overdue.";
    case "checked": return "Email queue checked.";
    default: return "Sync health is unverified.";
  }
}

export function DataQualityCard() {
  const { db, now } = useFinance();
  const [sync, setSync] = useState<SyncStatus>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let controller: AbortController | undefined;
    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      try {
        const response = await fetch("/api/gmail", { cache: "no-store", signal });
        if (!response.ok) throw new Error("Unavailable");
        const result: SyncStatus = await response.json();
        if (!signal.aborted) {
          setSync(result);
          setFailed(false);
        }
      } catch {
        if (!signal.aborted) setFailed(true);
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      controller?.abort();
      window.removeEventListener("focus", refresh);
    };
  }, []);

  if (!db) return null;
  const quality = dataQuality(db, indiaNow(now).slice(0, 10));

  return (
    <section aria-label="Data quality" className="space-y-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Data quality</h2>
        <Link href="/settings#gmail" className="text-sm underline">Review & sync</Link>
      </div>
      <p className="text-xs text-ink-secondary">
        {isSupabaseConfigured ? syncLabel(sync, failed) : "Local data · email sync is not configured."}
        {!failed && sync?.connection?.last_synced_at && (
          <> Last mailbox scan: {new Date(sync.connection.last_synced_at).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
          })} IST.</>
        )}
      </p>
      {!failed && ((sync?.financialReviewCount ?? sync?.reviewCount ?? 0) > 0 || (sync?.categoryReviewCount ?? 0) > 0) && (
        <p className="text-xs text-ink-secondary">
          {sync?.financialReviewCount ?? sync?.reviewCount ?? 0} emails need matching or financial review
          {" · "}{sync?.categoryReviewCount ?? 0} recorded entries need a category check.
        </p>
      )}
      <p className="text-xs text-ink-secondary">
        {quality.uncategorized} uncategorized expenses · <Amount value={quality.uncategorizedAmount} size="xs" /> in loaded history.
        {" "}These amounts are included in balances.
      </p>
      <p className="text-xs text-ink-secondary">
        {quality.verifiedTimes} of {quality.expenses} expenses have supported transaction times.
        {" "}Estimated or unknown times limit time-based insights.
      </p>
      <details className="text-xs">
        <summary className="cursor-pointer">Account balance checkpoints</summary>
        <ul className="mt-2 space-y-1">
          {quality.accounts.map(account => (
            <li key={account.id}>
              {account.name}: {account.status === "verified"
                ? `verified through ${account.asOf}`
                : account.status === "stale"
                  ? `checkpoint at ${account.asOf} needs rechecking`
                  : "no verified checkpoint"}
              {account.source ? ` · ${account.source}` : ""}
            </li>
          ))}
        </ul>
        {!quality.accounts.length && <p className="mt-2">No active bank, cash or card accounts.</p>}
      </details>
      <p className="text-xs text-ink-tertiary">
        A completed email scan does not verify bank balances. Checkpoints apply only through their stated dates.
      </p>
    </section>
  );
}
