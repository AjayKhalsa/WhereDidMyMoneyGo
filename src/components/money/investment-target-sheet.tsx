"use client";

import { useState } from "react";
import { useFinance } from "@/lib/hooks/use-finance";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import { endOfMonth, formatDayMonth, monthKeyToDate } from "@/lib/domain/dates";
import { parseAmountInput } from "@/lib/domain/money";
import { hasCycleTarget, investmentTarget } from "@/lib/domain/investment-targets";
import type { Investment } from "@/lib/domain/types";
import { investmentContributions } from "@/lib/engine/analytics";
import { saveInvestmentCycleTarget } from "@/lib/data/actions";
import { MoneyField, SelectField } from "@/components/ui/fields";
import { Button, TextAction } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { transactionOccurredBy } from "@/lib/domain/transaction-time";

export function InvestmentTargetSheet({ investmentId, onClose }: { investmentId: string; onClose: () => void }) {
  const { db, month, cycleStartDay } = useFinance();
  const [selectedId, setSelectedId] = useState(investmentId);
  const investment = db?.investments.find(i => i.id === selectedId && i.isActive);
  const [busy, setBusy] = useState(false);
  return <Sheet open onClose={() => { if (!busy) onClose(); }} title="This month's investment target" size="sm">
    <div className="space-y-5 py-1">
      <p className="text-sm text-ink-secondary">{formatDayMonth(monthKeyToDate(month))}–{formatDayMonth(endOfMonth(month, cycleStartDay))} only. Other cycles use your usual plan.</p>
      <SelectField label="Investment" value={selectedId} disabled={busy} onChange={e => setSelectedId(e.target.value)}>
        {db?.investments.filter(i => i.isActive).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
      </SelectField>
      {investment ? <TargetForm key={`${investment.id}:${month}`} investment={investment} busy={busy} setBusy={setBusy} onClose={onClose} /> : <p role="alert">Investment no longer exists. Close and reload.</p>}
    </div>
  </Sheet>;
}

function TargetForm({ investment, busy, setBusy, onClose }: { investment: Investment; busy: boolean; setBusy: (value: boolean) => void; onClose: () => void }) {
  const { db, month, cycleStartDay, now } = useFinance();
  const money = useMoneyText();
  const toast = useToast();
  const [amount, setAmount] = useState(String(investmentTarget(investment, month) / 100));
  const [useUsual, setUseUsual] = useState(!hasCycleTarget(investment, month));
  const [error, setError] = useState("");
  const value = parseAmountInput(amount);
  const valid = value !== null && value >= 0 && Number.isSafeInteger(value);
  const target = useUsual ? investment.monthlyContribution : value ?? 0;
  const contributed = investmentContributions([investment], (db?.transactions ?? []).filter(t => transactionOccurredBy(t, now)), month, cycleStartDay)[0]?.contributed ?? 0;
  const reserved = Math.max(0, target - contributed);
  const savedOverride = hasCycleTarget(investment, month);
  const changed = useUsual ? savedOverride : !savedOverride || value !== investmentTarget(investment, month);
  const max = Math.max(10000000, investment.monthlyContribution * 2, valid ? value : 0);
  const setValue = (next: string) => { setAmount(next); setUseUsual(false); setError(""); };
  async function save() {
    if (!valid || busy || !changed) return;
    setBusy(true); setError("");
    try {
      await saveInvestmentCycleTarget(investment.id, month, useUsual ? null : value);
      toast.show({ tone: "success", title: useUsual ? "Usual target restored" : "Target saved for this cycle" });
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the target."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <div className="inset-panel space-y-3 p-4">
      <MoneyField label="Target for this cycle" value={amount} min="0" disabled={busy} onChange={e => setValue(e.target.value)} hint={`Usual target: ${money(investment.monthlyContribution)}`} error={amount && !valid ? "Enter zero or a positive amount." : undefined} />
      <input type="range" className="budget-slider" aria-label="Adjust cycle target" aria-valuetext={money(target)} min={0} max={max} step={10000} value={valid ? value : 0} disabled={busy} onChange={e => setValue(String(Number(e.target.value) / 100))} />
      <div className="flex justify-between text-xs text-ink-tertiary"><span>{money(0)}</span><span>{money(max)}</span></div>
      <TextAction disabled={busy} onClick={() => { setAmount(String(investment.monthlyContribution / 100)); setUseUsual(true); setError(""); }}>Use usual plan</TextAction>
    </div>
    <dl className="space-y-2 rounded-xl bg-surface-sunken p-4 text-sm" aria-live="polite">
      <div className="flex justify-between gap-3"><dt>Recorded this cycle</dt><dd>{money(contributed)}</dd></div>
      <div className="flex justify-between gap-3"><dt>Still reserved after saving</dt><dd className="font-semibold">{money(reserved)}</dd></div>
    </dl>
    {valid && target < contributed && <p className="text-xs text-ink-secondary">{money(contributed)} is already recorded. A lower target does not reverse those payments.</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <Button block variant="primary" disabled={busy || !valid || !changed} onClick={() => void save()}>{busy ? "Saving…" : "Save cycle target"}</Button>
  </div>;
}
