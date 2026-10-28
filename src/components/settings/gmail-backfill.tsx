"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/primitives";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import { indiaNow } from "@/lib/domain/transaction-time";
import { isInvestmentNotice, type InvestmentNotice } from "@/lib/gmail/investment-notices";

interface HistoryItem {
  message_id: string;
  subject?: string | null;
  status: string;
  reason: string;
  candidate?: { merchant: string; amount: number; date: string; direction?: string } | InvestmentNotice | null;
}
interface Report {
  run: { start_date: string; end_date: string; status: string; discovery_complete: boolean; last_error?: string } | null;
  summary?: { discovered: number; processed: number; matched: number; proposed: number; needsReview: number; ignored: number; skipped: number; failed: number; pending: number; imported: number; complete: boolean };
  items: HistoryItem[];
  subscriptions: unknown[];
  patterns?: unknown[];
  more?: boolean;
}
async function request(method = "GET", body?: unknown): Promise<Report> {
  const response = await fetch("/api/gmail/backfill", {
    method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not check Gmail history.");
  return data;
}

export function GmailBackfill({ email }: { email?: string }) {
  const money = useMoneyText();
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(15);
  const today = indiaNow().slice(0, 10);
  const [start, setStart] = useState(() => new Date(Date.parse(today + "T00:00:00Z") - 89 * 86400000).toISOString().slice(0, 10));
  const [end, setEnd] = useState(today);

  useEffect(() => {
    let active = true;
    void request().then(result => {
      if (!active) return;
      setReport(result);
      if (result.run) { setStart(result.run.start_date); setEnd(result.run.end_date); }
    }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);

  async function scan() {
    setBusy(true); setError(""); setShown(15);
    try {
      for (let i = 0; i < 6; i++) {
        const result = await request("POST", i === 0 && (!report?.run || report.run.status === "complete") ? { start, end, refresh: true } : {});
        setReport(result);
        if (!result.more) break;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check interrupted; resume to finish.");
    } finally { setBusy(false); }
  }
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "gmail-missing-transaction-check.json"; anchor.click();
    URL.revokeObjectURL(url);
  }

  const summary = report?.summary;
  const attention = report?.items.filter(item => ["proposed", "review", "failed"].includes(item.status)) ?? [];
  const dateLocked = busy || !!report?.run && report.run.status !== "complete";
  const counts = summary && [
    summary.proposed ? `${summary.proposed} possibly missing` : "",
    summary.needsReview ? `${summary.needsReview} need a decision` : "",
    summary.failed ? `${summary.failed} failed` : "",
    summary.pending ? `${summary.pending} still to check` : "",
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <h3 className="text-sm font-medium">Check for missing transactions</h3>
      <p className="text-xs text-ink-secondary">Compares supported Gmail messages with your ledger. Recorded payments stay hidden; only possible gaps, uncertain matches and failures appear here.</p>
      {report?.run && <p className="text-xs text-ink-tertiary">Last checked period: {report.run.start_date} – {report.run.end_date}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {report?.run?.last_error && <p role="alert" className="text-sm text-danger">{report.run.last_error}</p>}
      {summary && <p role="status" className="text-sm">
        {counts || (summary.complete ? "No proposed additions or unresolved items in this scan." : "Check unfinished; continue to cover every page.")}
        {!summary.complete && counts ? " Check unfinished." : ""}
      </p>}
      <Button disabled={busy} onClick={() => void scan()}>
        {busy ? "Checking Gmail…" : report?.run?.status === "scanning" ? "Continue checking" : report?.run?.status === "attention" ? "Retry failed messages" : "Check Gmail for missing transactions"}
      </Button>
      {attention.slice(0, shown).map(item => {
        const candidate = item.candidate;
        const title = isInvestmentNotice(candidate) ? candidate.scheme : candidate?.merchant || item.subject || "Email needs review";
        return <div key={item.message_id} className="space-y-1 rounded-xl border border-line p-3 text-xs">
          <p className="font-medium">{title}</p>
          {isInvestmentNotice(candidate)
            ? candidate.netAmount !== undefined && <p>Allocated value: {money(candidate.netAmount)} · bank debit needs verification</p>
            : candidate && <p>{candidate.direction === "credit" ? "Credit" : "Debit"} {money(candidate.amount)} · {candidate.date}</p>}
          <p className="text-ink-secondary">{item.reason}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <a className="underline" target="_blank" rel="noreferrer" href={`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email ?? "")}#all/${item.message_id}`}>Open email</a>
            <Link href="/transactions" className="underline">Check ledger</Link>
          </div>
        </div>;
      })}
      {attention.length > shown && <Button variant="quiet" disabled={busy} onClick={() => setShown(value => value + 15)}>Show more ({attention.length - shown} remaining)</Button>}
      {!!attention.length && <p className="text-xs text-ink-tertiary">These are unresolved findings. This check has not added or changed transactions.</p>}
      <details className="space-y-3 text-xs">
        <summary className="cursor-pointer text-ink-secondary">Period & scan details</summary>
        <div className="flex flex-wrap gap-2">
          <label>From <input aria-label="Backfill from" type="date" className="rounded-lg border border-line bg-surface p-2" value={start} max={end} disabled={dateLocked} onChange={event => setStart(event.target.value)} /></label>
          <label>Through <input aria-label="Backfill through" type="date" className="rounded-lg border border-line bg-surface p-2" value={end} max={today} min={start} disabled={dateLocked} onChange={event => setEnd(event.target.value)} /></label>
        </div>
        {summary && <p className="text-ink-secondary">{summary.matched} already recorded and hidden · {summary.discovered} messages checked · {summary.skipped} non-payment or unsupported messages · {summary.ignored} dismissed · {summary.pending} queued.</p>}
        <p className="text-ink-tertiary">A check only covers the selected dates and supported formats. Statements verify balances. Existing dismissals and manual labels are preserved; ambiguous same-value payments are never merged automatically.</p>
        {report?.run && <Button variant="quiet" disabled={busy} onClick={download}>Download full audit</Button>}
      </details>
    </div>
  );
}
