"use client";

import { useState } from "react";
import { useFinance } from "@/lib/hooks/use-finance";
import { getRepository } from "@/lib/data/local-adapter";
import { refreshDatabase } from "@/lib/data/store";
import { parseReconciliation, previewReconciliation, saveReconciliation, type ReconciliationBundle } from "@/lib/import/reconciliation";
import { Button, Card } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";

function downloadBackup(value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `budget-before-reconciliation-${new Date().toISOString().replaceAll(":", "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReconciliationImport() {
  const { db } = useFinance();
  const [open, setOpen] = useState(false);
  const [bundle, setBundle] = useState<ReconciliationBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  let preview: ReturnType<typeof previewReconciliation> | null = null;
  let previewError: string | null = null;
  if (db && bundle) {
    try { preview = previewReconciliation(db, bundle); }
    catch (cause) { previewError = cause instanceof Error ? cause.message : "Could not validate this file."; }
  }

  async function read(file?: File) {
    setBundle(null); setError(null); setStatus("");
    if (!file) return;
    try {
      if (file.size > 20_000_000) throw new Error("Choose a reconciliation file smaller than 20 MB.");
      setBundle(parseReconciliation(JSON.parse(await file.text())));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read this file."); }
  }

  async function save() {
    if (!bundle || !preview || busy) return;
    setBusy(true); setError(null);
    try {
      const repo = getRepository();
      const fresh = await repo.load();
      if (!fresh) throw new Error("Could not back up your existing data.");
      previewReconciliation(fresh, bundle);
      downloadBackup(fresh);
      await saveReconciliation(repo, bundle, (done, total) => setStatus(`Saving ${done} of ${total}…`));
      await refreshDatabase();
      setStatus("Saved and checked against the statement balances.");
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Could not finish saving."} Some rows may already be saved. Keep this file: matching saved rows are skipped when you retry.`);
      setStatus("");
      await refreshDatabase().catch(() => {});
    } finally { setBusy(false); }
  }

  return <>
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium">Import a reconciled batch</h3>
        <p className="mt-1 text-[13px] text-ink-secondary">Load a prepared file with matched transfers, categories and statement balance checks. Existing history is preserved.</p>
      </div>
      <Button size="sm" onClick={() => setOpen(true)}>Review reconciliation</Button>
    </Card>
    <Sheet open={open} onClose={() => { if (!busy) setOpen(false); }} title="Reconcile statements">
      <div className="space-y-5">
        <p className="text-sm text-ink-secondary">Choose a prepared reconciliation JSON file. You’ll see the changes and closing balances before saving. A backup downloads before any changes.</p>
        <label className="block space-y-2 text-sm">
          <span>Reconciliation file</span>
          <input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} className="block w-full text-sm" />
        </label>
        {(error || previewError) && <p role="alert" className="text-sm text-danger">{error || previewError}</p>}
        {preview && <>
          <div className="space-y-1 text-sm">
            <p className="font-medium">{bundle?.label}</p>
            <p>{preview.added} new · {preview.updated} updated · {preview.alreadySaved} already saved</p>
          </div>
          <ul className="space-y-3 text-sm">
            {preview.checks.map((check) => <li key={`${check.accountId}-${check.asOf}`}>
              <p className="font-medium">{check.name}: ₹{(check.balance / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              <p className="text-ink-secondary">As of {check.asOf} · difference ₹0.00</p>
            </li>)}
          </ul>
          <Button variant="primary" block disabled={busy || preview.added + preview.updated === 0} onClick={() => void save()}>
            {busy ? "Saving…" : "Back up and save reconciliation"}
          </Button>
        </>}
        {status && <p role="status" className="text-sm">{status}</p>}
      </div>
    </Sheet>
  </>;
}
