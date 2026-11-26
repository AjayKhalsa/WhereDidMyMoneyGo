"use client";

import { useMemo, useState } from "react";
import { useFinance } from "@/lib/hooks/use-finance";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import { contextLabel } from "@/lib/domain/contexts";
import { timeLabel } from "@/lib/domain/transaction-time";
import { discoverTimePatterns, planHistoryEnrichment, type TimeEvidence } from "@/lib/engine/history-enrichment";
import { applyHistoryEnrichment, saveRule } from "@/lib/data/actions";
import { isSupabaseConfigured } from "@/lib/data/supabase-client";
import { InfoButton } from "@/components/ui/info-button";
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
      setMessage(`Found ${body.evidence.length} bank times. Review the changes below.`);
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
      setMessage(`Updated ${changes.length} expenses. Previous data backed up.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save. Refresh and review again."); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <div className="flex items-start justify-between gap-3"><p className="pt-2 text-sm text-ink-secondary">Review categories, times and tags on past expenses before applying changes.</p><InfoButton title="Expense cleanup"><p>Meal categories use verified Indian transaction times: breakfast before noon, lunch until 5 PM, snacks until 8 PM, then dinner. Explicit descriptions, coffee and drinks keep their meaning.</p><p>Bank times come only from alerts linked to the same payment, account, amount and date. Unknown times stay unknown.</p><p>Rule suggestions need four manually recorded examples across three dates, with at least 80% agreement. Automated tags do not train more rules. Review the examples before enabling a rule.</p></InfoButton></div>
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={() => { setMessage(""); preview(); }}>Preview changes</Button>
      {isSupabaseConfigured && <Button variant="secondary" disabled={busy} onClick={loadTimes}>Find bank times</Button>}
    </div>
    {message && <p role="status" className="text-sm text-ink-secondary">{message}</p>}
    {plan && <div className="space-y-3 rounded-xl border border-line p-4">
      <p className="text-sm">{plan.changes.length} changes · {plan.unknownTimeIds.length} times unknown · {plan.conflicts.length} conflicts skipped</p>
      <p className="text-xs text-ink-tertiary">Amounts, accounts, payment types and dates stay unchanged. A backup downloads before saving.</p>
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
      <h3 className="text-sm font-medium">Suggested rules</h3>
      {!patterns.length && <p className="text-sm text-ink-secondary">No suggestions yet. Confirm times and add tags as you log expenses.</p>}
      {patterns.map(p => <div key={p.rule.id} className="space-y-2 rounded-xl border border-line p-3">
        <p className="text-sm font-medium">{p.rule.merchant} → {p.rule.contexts.map(c => contextLabel(c.value)).join(", ")}</p>
        <p className="text-xs text-ink-secondary">{p.explanation}</p>
        <div className="flex flex-wrap gap-3">
          <TextAction onClick={() => setExamples(p.rule.learningEvidence!.exampleIds)}>View examples</TextAction>
          <Button disabled={busy} onClick={async () => { setBusy(true); try { await saveRule(p.rule); setPlan(null); setMessage("Rule enabled for future matching expenses. Preview history to apply it to past expenses."); } catch(error) { setMessage(error instanceof Error ? error.message : "Could not save rule."); } finally { setBusy(false); } }}>Use rule</Button>
        </div>
      </div>)}
    </div>
    <Sheet open={examples !== null} onClose={() => setExamples(null)} title="Review expenses" description="Tap an expense to confirm its actual time or edit its tags." size="lg">
      <TransactionList transactions={db.transactions.filter(t => examples?.includes(t.id))} showTime showDayTotals={false} />
    </Sheet>
  </div>;
}
