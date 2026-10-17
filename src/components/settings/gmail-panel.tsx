"use client";

import { useEffect, useState } from "react";
import type { Alert } from "@/lib/gmail/alerts";
import { useFinance } from "@/lib/hooks/use-finance";
import { refreshDatabase } from "@/lib/data/store";
import { formatMoney } from "@/lib/domain/money";
import { Button, Card, Section } from "@/components/ui/primitives";

interface ReviewMail { message_id: string; subject: string; reason?: string; candidate?: Alert }
interface Status {
  configured: boolean;
  connection: { email: string; start_date: string; last_synced_at?: string; last_error?: string; more: boolean } | null;
  messages: ReviewMail[];
  reviewCount: number;
}
async function api(path = "", method = "GET", body?: unknown) {
  const response = await fetch(`/api/gmail${path}`, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not complete Gmail request.");
  return result;
}
export function GmailPanel() {
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  async function load() { setStatus(await api()); }
  useEffect(() => {
    void load().catch(e => setError(e.message));
    const result = new URLSearchParams(window.location.search).get("gmail");
    if (result === "connected") setNotice("Gmail connected. Sync now to import your first alerts.");
    if (result === "failed") setError("Connection was not completed. Use the same Gmail address as your app login and allow read-only access.");
  }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  return <Section title="Gmail transaction alerts" description="Let bank emails keep your ledger up to date.">
    <Card className="space-y-4 p-4 sm:p-5">
      <p className="text-sm text-ink-secondary">Checks HDFC, ICICI, Axis and HSBC alerts daily. Recognized purchases are categorized automatically; uncertain transactions and possible duplicates wait here for review. Statements are still needed to verify balances.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="text-sm text-ink-secondary">{notice}</p>}
      {!status && !error && <p className="text-sm">Checking connection…</p>}
      {status && !status.configured && <p className="text-sm text-ink-secondary">Google connection setup is pending. Automatic logging has not started.</p>}
      {status?.configured && !status.connection && <>
        <label className="block text-sm">Import alerts from
          <input className="ml-3 rounded-lg border border-line bg-surface p-2" type="date" value={startDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setStartDate(e.target.value)} />
        </label>
        <p className="text-xs text-ink-tertiary">Google grants read-only access to your mailbox. This app fetches only supported bank senders, keeps extracted transaction details, and does not send, delete or mark emails read. No email bodies are sent to AI.</p>
        <Button disabled={busy || !startDate} onClick={() => void run(async () => { const result = await api("/connect", "POST", { startDate }); window.location.assign(result.url); })}>Connect Gmail</Button>
      </>}
      {status?.connection && <>
        <div className="text-sm"><p className="font-medium">Connected: {status.connection.email}</p><p className="mt-1 text-ink-tertiary">From {status.connection.start_date} · Last mailbox check: {status.connection.last_synced_at ? new Date(status.connection.last_synced_at).toLocaleString() : "Not yet"}</p></div>
        {status.connection.last_error && <p className="text-sm text-danger">{status.connection.last_error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void run(async () => {
            let logged = 0, more = true;
            for (let i = 0; i < 6 && more; i++) { const result = await api("/sync", "POST"); logged += result.logged; more = result.more; setNotice(`Imported ${logged} transactions. ${more ? "Checking more alerts…" : "Sync complete."}`); }
            await refreshDatabase();
            setNotice(`Imported ${logged} transactions. ${more ? "More alerts remain. Press Sync now to continue." : "Sync complete."}`);
          })}>{busy ? "Working…" : "Sync now"}</Button>
          <Button variant="quiet" disabled={busy} onClick={() => setDisconnecting(!disconnecting)}>Disconnect</Button>
          {status.connection.last_error?.includes("Reconnect") && <Button disabled={busy} onClick={() => void run(async () => { const result = await api("/connect", "POST", { startDate: status.connection!.start_date }); window.location.assign(result.url); })}>Reconnect Gmail</Button>}
        </div>
        {disconnecting && <div className="space-y-2 text-sm"><p>Stop automatic imports and revoke Google access? Your saved transactions and duplicate checks stay in the app.</p><Button variant="danger" disabled={busy} onClick={() => void run(async () => { await api("", "DELETE"); setDisconnecting(false); setNotice("Disconnected. Your saved transactions are unchanged."); })}>Disconnect Gmail</Button></div>}
      </>}
      {!!status?.reviewCount && <p className="text-sm font-medium">{status.reviewCount} alerts need review{status.reviewCount > 50 ? " — showing the first 50" : ""}</p>}
      {status?.messages.map(mail => <ReviewRow key={mail.message_id} mail={mail} email={status.connection?.email} disabled={busy} onSaved={async () => { await load(); await refreshDatabase(); }} />)}
    </Card>
  </Section>;
}

function ReviewRow({ mail, email, disabled, onSaved }: { mail: ReviewMail; email?: string; disabled: boolean; onSaved: () => Promise<void> }) {
  const { db } = useFinance(); const a = mail.candidate;
  const [accountId, setAccountId] = useState(a?.accountId ?? "");
  const [categoryId, setCategoryId] = useState(a?.categoryId ?? "");
  const [kind, setKind] = useState(a?.direction === "credit" ? "" : "EXPENSE");
  const [toAccountId, setToAccountId] = useState("");
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const inputClass = "rounded-lg border border-line bg-surface p-2 text-sm";
  async function submit(action: "log" | "ignore") {
    setBusy(true); setError("");
    try {
      if (action === "log" && remember) await api("/mapping", "POST", { messageId: mail.message_id, accountId });
      await api("/review", "POST", { action, messageId: mail.message_id, accountId, categoryId, type: kind === "REFUND" ? "INCOME" : kind, isRefund: kind === "REFUND", toAccountId, allowDuplicate });
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3 border-t border-line pt-4">
    <p className="text-sm font-medium">{a ? `${a.merchant} · ${formatMoney(a.amount)} · ${a.date}` : mail.subject}</p>
    {a && <p className="text-xs text-ink-tertiary">{a.bank} {a.instrument.replace("_", " ")} ending {a.tail}</p>}
    <p className="text-sm text-ink-secondary">{mail.reason || "Check these details before adding."}</p>
    <a className="text-sm underline" target="_blank" rel="noreferrer" href={`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email ?? "")}#all/${mail.message_id}`}>View original email</a>
    {a && <>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Transaction type" className={inputClass} value={kind} onChange={e => setKind(e.target.value)}><option value="">Choose type</option><option value="EXPENSE">Expense</option><option value="INCOME">Income</option><option value="REFUND">Refund</option><option value="TRANSFER">Transfer / card repayment</option></select>
        <select aria-label="Account" className={inputClass} value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">{kind === "TRANSFER" ? "From account" : "Choose account"}</option>{db?.accounts.filter(a => a.isActive).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        {kind === "TRANSFER" ? <select aria-label="Destination account" className={inputClass} value={toAccountId} onChange={e => setToAccountId(e.target.value)}><option value="">To account</option>{db?.accounts.filter(a => a.isActive && a.id !== accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select> : (kind === "EXPENSE" || kind === "REFUND") && <select aria-label="Category" className={inputClass} value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Choose category</option>{db?.categories.map(c => <option key={c.id} value={c.id}>{c.parentId ? `${db.categories.find(p => p.id === c.parentId)?.name} / ` : ""}{c.name}</option>)}</select>}
      </div>
      {kind !== "TRANSFER" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />Remember this card/account match for future alerts</label>}
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={allowDuplicate} onChange={e => setAllowDuplicate(e.target.checked)} />I checked the ledger: this is a separate transaction even if the amount and date match.</label>
    </>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="flex gap-2">{a && <Button size="sm" disabled={disabled || busy || !accountId || !kind} onClick={() => void submit("log")}>Add to ledger</Button>}<Button size="sm" variant="quiet" disabled={disabled || busy} onClick={() => void submit("ignore")}>Already recorded / dismiss</Button></div>
  </div>;
}
