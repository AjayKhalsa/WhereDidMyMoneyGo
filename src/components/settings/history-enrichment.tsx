"use client";

import { useMemo, useState } from "react";
import { useFinance } from "@/lib/hooks/use-finance";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import { contextLabel } from "@/lib/domain/contexts";
import { timeLabel } from "@/lib/domain/transaction-time";
import { discoverTimePatterns, planHistoryEnrichment, type TimeEvidence } from "@/lib/engine/history-enrichment";
import { applyHistoryEnrichment, saveRule } from "@/lib/data/actions";
import { isSupabaseConfigured } from "@/lib/data/supabase-client";
import { Button, TextAction } from "@/components/ui/primitives";
import { TransactionList } from "@/components/transactions/transaction-list";
import { Sheet } from "@/components/ui/sheet";
import type { Database } from "@/lib/domain/types";

function downloadBackup(db: Database) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url;
  link.download = `budget-before-enrichment-${new Date().toISOString().replaceAll(":", "-")}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function HistoryEnrichment() {
  const { db, categories } = useFinance();
  const money = useMoneyText();
  const [evidence, setEvidence] = useState<TimeEvidence[]>([]);
  const [plan, setPlan] = useState<ReturnType<typeof planHistoryEnrichment> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [examples, setExamples] = useState<string[] | null>(null);
  const patterns = useMemo(() => discoverTimePatterns(db?.transactions ?? [], db?.rules ?? []), [db?.transactions, db?.rules]);
  if (!db) return null;
  const preview = (times = evidence) => {
    const next = planHistoryEnrichment(db, times);
    setPlan(next); setSelected(new Set(next.changes.map(c => c.before.id)));
  };
  const loadTimes = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/gmail/timing", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load saved bank timestamps.");
      setEvidence(body.evidence); preview(body.evidence);
      setMessage(`Loaded ${body.evidence.length} verified bank timestamp observations. Review the proposed updates below.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load bank times."); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!plan) return;
    const changes = plan.changes.filter(c => selected.has(c.before.id));
    setBusy(true); setMessage("");
    try {
      await applyHistoryEnrichment(changes, downloadBackup);
      setPlan(null); setSelected(new Set());
      setMessage(`Updated ${changes.length} historical expenses. A backup of the previous data was downloaded.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save. Refresh and review again."); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <p className="text-sm text-ink-secondary">Meal rules use actual transaction time in India: before 12 PM → breakfast; 12–5 PM → lunch; 5–8 PM → snacks; from 8 PM → dinner. Explicit meal descriptions, coffee and drinks keep their meaning.</p>
    <p className="text-sm text-ink-secondary">Review all past expenses using saved clocks and approved rules. Bank times are recovered only from alerts already linked to the same transaction, account, amount and date. Unknown clocks stay unknown.</p>
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={() => { setMessage(""); preview(); }}>Preview past expenses</Button>
      {isSupabaseConfigured && <Button variant="secondary" disabled={busy} onClick={loadTimes}>Load saved bank times</Button>}
    </div>
    {message && <p role="status" className="text-sm text-ink-secondary">{message}</p>}
    {plan && <div className="space-y-3 rounded-xl border border-line p-4">
      <p className="text-sm">{plan.changes.length} proposed updates · {plan.unknownTimeIds.length} expenses without a verified clock · {plan.conflicts.length} conflicting matches skipped</p>
      <p className="text-xs text-ink-tertiary">Amounts, accounts, transaction types and calendar dates stay fixed. Personal tags are retained; only factual time tags are recomputed. A backup downloads before saving.</p>
      <TextAction onClick={() => setSelected(selected.size === plan.changes.length ? new Set() : new Set(plan.changes.map(c => c.before.id)))}>{selected.size === plan.changes.length ? "Deselect all" : "Select all"}</TextAction>
      <div className="max-h-[28rem] space-y-3 overflow-y-auto">
        {plan.changes.map(change => <label key={change.before.id} className="flex gap-3 border-t border-line pt-3 text-sm">
          <input type="checkbox" checked={selected.has(change.before.id)} disabled={busy} onChange={() => setSelected(current => { const next = new Set(current); if (next.has(change.before.id)) next.delete(change.before.id); else next.add(change.before.id); return next; })} />
          <span className="min-w-0">
            <span className="block font-medium">{change.before.description} · {money(change.before.amount)}</span>
            <span className="block text-xs text-ink-secondary">{change.before.date.slice(0,10)} · {timeLabel(change.before)} → {timeLabel(change.after)}</span>
            <span className="block text-xs">{categories.pathOf(change.before.categoryId)} → {categories.pathOf(change.after.categoryId)}</span>
            <span className="block text-xs text-ink-secondary">Tags: {change.before.contexts.map(c => contextLabel(c.value)).join(", ") || "none"} → {change.after.contexts.map(c => contextLabel(c.value)).join(", ") || "none"}</span>
            <span className="block text-xs text-ink-tertiary">{change.reasons.join(" ")}</span>
          </span>
        </label>)}
      </div>
      <Button disabled={busy || selected.size === 0} onClick={apply}>Update {selected.size} selected expenses</Button>
      {plan.unknownTimeIds.length > 0 && <TextAction onClick={() => setExamples(plan.unknownTimeIds)}>Review expenses with unknown times</TextAction>}
    </div>}
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Patterns to turn into rules</h3>
      <p className="text-xs text-ink-tertiary">Suggestions require at least four user-recorded examples across three dates, with 80% agreement. Automated tags do not train more rules. A pattern suggests a habit; confirm its meaning before enabling it.</p>
      {!patterns.length && <p className="text-sm text-ink-secondary">No sufficiently supported time-and-tag patterns yet. Confirm actual times and add context to your expenses; suggestions will appear as the evidence builds.</p>}
      {patterns.map(p => <div key={p.rule.id} className="space-y-2 rounded-xl border border-line p-3">
        <p className="text-sm font-medium">{p.rule.merchant} → {p.rule.contexts.map(c => contextLabel(c.value)).join(", ")}</p>
        <p className="text-xs text-ink-secondary">{p.explanation}</p>
        <div className="flex flex-wrap gap-3">
          <TextAction onClick={() => setExamples(p.rule.learningEvidence!.exampleIds)}>See supporting transactions</TextAction>
          <Button disabled={busy} onClick={async () => { setBusy(true); try { await saveRule(p.rule); setPlan(null); setMessage("Rule enabled for future matching expenses. Preview history to apply it to past expenses."); } catch(error) { setMessage(error instanceof Error ? error.message : "Could not save rule."); } finally { setBusy(false); } }}>Enable this rule</Button>
        </div>
      </div>)}
    </div>
    <Sheet open={examples !== null} onClose={() => setExamples(null)} title="Transactions behind the evidence" description="Tap an expense to confirm its actual time or edit its tags." size="lg">
      <TransactionList transactions={db.transactions.filter(t => examples?.includes(t.id))} showTime showDayTotals={false} />
    </Sheet>
  </div>;
}
