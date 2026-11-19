"use client";

import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/data/supabase-client";
import { Button } from "@/components/ui/primitives";
import { TextField } from "@/components/ui/fields";
import { refreshDatabase } from "@/lib/data/store";

type Status = { configured: boolean; evidence: { message_id: string; subject: string; pdf_status: string; processing_note: string }[] };
export function StatementSyncPanel({ accountId }: { accountId: string }) {
  const [status, setStatus] = useState<Status | null>(null), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/gmail/statements?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store", signal });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Statement status unavailable.");
    if (!signal?.aborted) setStatus(data);
  }, [accountId]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const controller = new AbortController();
    void load(controller.signal).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [load]);

  async function save() {
    if (!password || busy) return; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/gmail/statements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, password }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Couldn't save the PDF password.");
      setPassword(""); await load(); await refreshDatabase();
      setMessage(data.message ?? (data.complete ? "Statement scan finished. Check the source status below." : "Password saved encrypted. Statement processing will continue with Gmail sync."));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Couldn't save the PDF password."); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/gmail/statements", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId }) });
      if (!response.ok) throw new Error("Couldn't remove the saved PDF password.");
      await load(); setMessage("Saved PDF password removed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Couldn't remove the saved PDF password."); }
    finally { setBusy(false); }
  }
  if (!isSupabaseConfigured) return null;
  return <section className="rounded-xl border border-line p-4">
    <h3 className="text-sm font-medium">Automatic statement checks</h3>
    <p className="mt-1 text-xs text-ink-secondary">Bills are read from your connected bank emails. Encrypted PDFs need their password once per card.</p>
    {status?.evidence.map(e => <div key={e.message_id} className="mt-3 rounded-lg bg-surface-sunken p-3 text-xs">
      <p className="font-medium">{e.subject}</p><p className="mt-1 text-ink-secondary">{e.processing_note || "Statement received; processing pending."}</p>
      <a className="mt-2 inline-block underline underline-offset-4" href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(e.message_id)}`} target="_blank" rel="noopener noreferrer">Open source email</a>
    </div>)}
    {status && status.evidence.length === 0 && <p className="mt-3 text-xs text-ink-secondary">No matched statement yet. Run Gmail sync in Settings to check.</p>}
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{status?.configured ? "PDF access set up · update or remove" : "Unlock monthly statement PDFs"}</summary>
      <div className="space-y-3 py-2">
        <TextField type="password" label="Statement PDF password" autoComplete="new-password" value={password} maxLength={160} onChange={e => setPassword(e.target.value)} disabled={busy} hint="Stored encrypted on the server. Your password is never returned to this screen."/>
        <Button onClick={() => void save()} disabled={busy || !password}>{busy ? "Checking statements…" : "Save password & check statements"}</Button>
        {status?.configured && <Button variant="ghost" disabled={busy} onClick={() => void remove()}>Remove saved PDF password</Button>}
      </div>
    </details>
    {message && <p role="status" className="mt-3 text-xs text-ink-secondary">{message}</p>}
  </section>;
}
