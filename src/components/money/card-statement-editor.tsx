"use client";

import { useState } from "react";
import type { CreditCardDetail } from "@/lib/domain/types";
import { validCardStatement } from "@/lib/domain/card-statement";
import { parseAmountInput } from "@/lib/domain/money";
import { saveCreditCardDetail } from "@/lib/data/actions";
import { Button } from "@/components/ui/primitives";
import { MoneyField, TextField } from "@/components/ui/fields";

export function CardStatementEditor({ detail }: { detail: CreditCardDetail }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String((detail.reportedStatement?.amount ?? 0) / 100));
  const [issuedOn, setIssuedOn] = useState(detail.reportedStatement?.issuedOn ?? "");
  const [dueOn, setDueOn] = useState(detail.reportedStatement?.dueOn ?? "");
  const [source, setSource] = useState(detail.reportedStatement?.source ?? "Bank statement");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const reportedStatement = { amount: parseAmountInput(amount), issuedOn, dueOn, source: source.trim(), recordedAt: new Date().toISOString() };
    if (!validCardStatement(reportedStatement)) { setError("Enter a valid amount, statement date, due date and source."); return; }
    setBusy(true); setError("");
    try { await saveCreditCardDetail({ ...detail, reportedStatement }); setOpen(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't save the statement."); }
    finally { setBusy(false); }
  }

  return <div className="rounded-xl border border-line p-4">
    <button type="button" className="flex min-h-11 w-full items-center justify-between text-left text-sm font-medium" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span>Record issuer statement</span><span aria-hidden>{open ? "−" : "+"}</span>
    </button>
    {open && <div className="mt-3 space-y-3">
      <p className="text-xs text-ink-secondary">Enter the full billed amount on the dated statement. This updates the bill shown here; it does not change transactions or total outstanding.</p>
      <MoneyField label="Billed amount" value={amount} onChange={e => setAmount(e.target.value)} disabled={busy}/>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Statement date" type="date" value={issuedOn} onChange={e => setIssuedOn(e.target.value)} disabled={busy}/>
        <TextField label="Payment due date" type="date" value={dueOn} onChange={e => setDueOn(e.target.value)} disabled={busy}/>
      </div>
      <TextField label="Source" value={source} maxLength={120} onChange={e => setSource(e.target.value)} disabled={busy}/>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save statement"}</Button>
    </div>}
  </div>;
}
