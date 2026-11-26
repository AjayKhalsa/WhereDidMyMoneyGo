"use client";

import { useState } from "react";
import { useFinance } from "@/lib/hooks/use-finance";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import { linkSubscriptionPayment, markRecurringPaid } from "@/lib/data/actions";
import { subscriptionPaymentCandidates } from "@/lib/engine/subscription-payments";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/primitives";

export function SubscriptionPaymentSheet({ transactionId, ruleId, onClose }: {
  transactionId?: string; ruleId?: string; onClose: () => void;
}) {
  const { db, now } = useFinance();
  const money = useMoneyText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [separate, setSeparate] = useState(false);
  const transaction = db?.transactions.find(t => t.id === transactionId);
  const rule = db?.recurring.find(r => r.id === ruleId);
  const candidates = rule ? subscriptionPaymentCandidates(rule, db?.transactions ?? [], now) : [];
  const rules = (db?.recurring ?? []).filter(r => r.type === 'EXPENSE' && (!r.accountId || r.accountId === transaction?.accountId))
    .sort((a, b) => Number(b.amount === transaction?.amount) - Number(a.amount === transaction?.amount));

  async function save(paymentId: string, subscriptionId: string) {
    setBusy(true); setError("");
    try { await linkSubscriptionPayment(paymentId, subscriptionId); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not link the payment.'); }
    finally { setBusy(false); }
  }
  async function record() {
    if (!rule) return;
    setBusy(true); setError("");
    try { await markRecurringPaid(rule, now, { allowSeparate: separate }); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not record the payment.'); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open onClose={onClose} title={rule ? `Payment for ${rule.description}` : 'Link bill or subscription'} size="sm">
      <div className="space-y-4 py-1">
        <p className="text-sm text-ink-secondary">Link a recorded charge to its bill without adding another expense.</p>
        {transaction && <div className="rounded-xl bg-surface-sunken p-3 text-sm">{transaction.description} · {money(transaction.amount)} · {transaction.date.slice(0, 10)}{transaction.recurringId&&<p className="mt-2 text-xs text-ink-secondary">Currently linked to {db?.recurring.find(r=>r.id===transaction.recurringId)?.description}. Choosing another bill changes the link.</p>}</div>}
        {transaction ? (
          <div className="space-y-2">{rules.map(schedule => (
            <Button block key={schedule.id} disabled={busy} onClick={() => void save(transaction.id, schedule.id)}>
              {schedule.description} · {money(schedule.amount)}{transaction.recurringId === schedule.id ? ' · Linked' : ''}
            </Button>
          ))}{rules.length === 0 && <p className="text-sm">Add your subscription under Money → Bills & subscriptions first.</p>}</div>
        ) : rule ? <>
          <h3 className="text-sm font-medium">Recorded charges this calendar month</h3>
          <p className="text-xs text-ink-secondary">Check which service each charge belongs to—Apple bills several subscriptions.</p>
          <div className="space-y-2">{candidates.map(payment => (
            <button key={payment.id} type="button" disabled={busy} onClick={() => void save(payment.id, rule.id)} className="min-h-14 w-full rounded-xl border border-line p-3 text-left text-sm disabled:opacity-50">
              <span className="block font-medium">{payment.description} · {money(payment.amount)}</span>
              <span className="mt-1 block text-xs text-ink-secondary">{payment.date.slice(0, 10)} · {payment.recurringId ? 'Already linked' : 'Tap to link this charge'}</span>
            </button>
          ))}{candidates.length === 0 && <p className="text-sm text-ink-secondary">No matching charge found. Check Transactions before adding a payment.</p>}</div>
          {candidates.length > 0 && <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={separate} onChange={e => setSeparate(e.target.checked)} />This is a separate, additional payment</label>}
          <Button block disabled={busy || candidates.length > 0 && !separate} onClick={() => void record()}>
            Record new payment · {money(rule.amount)}
          </Button>
          <p className="text-xs text-ink-secondary">A new payment debits your account. Edit the bill to change its schedule.</p>
        </> : null}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}
