"use client";

import { useEffect, useState } from "react";
import { isInvestmentNotice, type InvestmentNotice } from "@/lib/gmail/investment-notices";
import { isInvestmentDebit, type Alert } from "@/lib/gmail/alerts";
import { useNotifications } from '@/lib/hooks/use-notifications';
import { useFinance } from "@/lib/hooks/use-finance";
import { refreshDatabase } from "@/lib/data/store";
import { formatMoney } from "@/lib/domain/money";
import { InfoButton } from "@/components/ui/info-button";
import { Button, Card, Section } from "@/components/ui/primitives";
import { possibleExistingTransactions } from "@/lib/import/identity";
import { alertTimeLabel } from "@/lib/gmail/alert-time";
import { FoodReceipts } from "./food-receipts";
import { GmailBackfill } from './gmail-backfill';
import { suggestedExistingEntry } from "@/lib/gmail/review-list";
import { reviewDefaults } from '@/lib/gmail/review-defaults';
import type { CategoryReviewState } from '@/lib/gmail/category-review';

interface ReviewMail extends CategoryReviewState { message_id: string; subject: string; reason?: string; candidate?: Alert; category_review?: boolean; suppress_suggested_match?:boolean }
type ReviewItem = Omit<ReviewMail, "candidate"> & { candidate?: Alert | InvestmentNotice };
interface Status {
  configured: boolean;
  connection: { email: string; start_date: string; last_synced_at?: string; last_error?: string; more: boolean } | null;
  messages: ReviewItem[];
  reviewCount: number;
  categoryMessages?:ReviewItem[];
  possibleExistingMessages?:ReviewItem[];
  categoryReviewCount?:number;
  possibleExistingCount?:number;
  health?: { state: string; stale: boolean; pending: number; review: number; historicalOutdated: boolean; historicalDiscoveryComplete: boolean; schedule: string;needsReconnect?:boolean;needsSetup?:boolean };
}
async function api(path = "", method = "GET", body?: unknown) {
  const response = await fetch(`/api/gmail${path}`, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not complete Gmail request.");
  return result;
}
function syncNotice(logged: number, matched: number, more: boolean, final = false) {
  const changes = [logged ? `${logged} added` : '', matched ? `${matched} matched` : ''].filter(Boolean).join(' · ');
  return `${changes ? changes + '. ' : ''}${more ? final ? 'More alerts remain. Sync again to continue.' : 'Checking more alerts…' : changes ? 'Sync complete.' : 'No new transactions. Sync complete.'}`;
}
export function GmailPanel() {
  const {refresh:refreshNotifications}=useNotifications();
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  async function load() { setStatus(await api()); void refreshNotifications(); }
  useEffect(() => {
    void load().catch(e => setError(e.message));
    const result = new URLSearchParams(window.location.search).get("gmail");
    if (result === "connected") setNotice("Gmail connected. Ready to sync.");
    if (result === 'busy')setError('A Gmail sync is running. Wait for it to finish, then reconnect again; saved progress is preserved.');
    if (result === 'setup')setError('The Google OAuth app configuration needs attention. Reconnecting alone will not fix this server setup issue.');
    if (result === "failed") setError("Connection was not completed. Use the same Gmail address as your app login and allow read-only access.");
  }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Please try again.");try{await load();}catch{/* Keep the original controlled failure visible. */} }
    finally { setBusy(false); }
  }
  const health = status?.health;
  const healthSummary = health ? [
    health.state === 'error' ? 'Sync needs attention.' : health.state === 'incomplete' ? 'Sync unfinished.' : health.stale ? 'Mailbox check overdue.' : '',
    health.pending > 0 ? `${health.pending} queued.` : '',
    health.review > 0 ? `${health.review} need review.` : '',
  ].filter(Boolean).join(' ') : '';
  return <Section title="Gmail imports" description="Bank alerts and payment confirmations." action={<InfoButton title="Email imports"><p>Confirmed debits, salary credits and posted card refunds can be added automatically. Uncertain payments and possible duplicates need your review.</p><p>Saved category rules guide suggestions. Verified bank times use IST; estimated times are labelled.</p><p>Email checks do not verify bank balances. Compare against a bank or card balance when reconciling.</p></InfoButton>}>
    <Card className="space-y-4 p-4 sm:p-5">
      {(error||status?.connection?.last_error)&&<p role="alert" className="text-sm text-danger">{error||status?.connection?.last_error}</p>}
      {notice && <p role="status" className="text-sm text-ink-secondary">{notice}</p>}
      {!status && !error && <p className="text-sm">Checking connection…</p>}
      {status && !status.configured && <p className="text-sm text-ink-secondary">Email imports are not set up yet.</p>}
      {status?.configured && !status.connection && <>
        <label className="block text-sm">Import alerts from
          <input className="ml-3 rounded-lg border border-line bg-surface p-2" type="date" value={startDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setStartDate(e.target.value)} />
        </label>
        <p className="text-xs text-ink-tertiary">Read-only Gmail access. We keep extracted transaction details, never send or delete emails, and never mark them read. Email bodies are not sent to AI.</p>
        <Button disabled={busy || !startDate} onClick={() => void run(async () => { const result = await api("/connect", "POST", { startDate }); window.location.assign(result.url); })}>Connect Gmail</Button>
      </>}
      {status?.connection && <>
        <div className="text-sm"><p className="break-all font-medium">{status.connection.email}</p><p className="mt-1 text-ink-secondary">Last checked: {status.connection.last_synced_at ? new Date(status.connection.last_synced_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})+" IST" : "Not yet"}</p></div>
        {status.health && (healthSummary || status.health.historicalOutdated) && <div className="space-y-1 text-xs text-ink-secondary" aria-label="Gmail sync health">
          {healthSummary && <p>{healthSummary}</p>}
          {status.health.historicalOutdated && <p className="text-danger">Older alerts need rechecking. Run “Check for missing transactions” below.</p>}
        </div>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void run(async () => {
            let logged = 0, matched = 0, more = true;
            for (let i = 0; i < 6 && more; i++) { const result = await api("/sync", "POST"); logged += result.logged; matched += result.matched ?? 0; more = result.more; setNotice(syncNotice(logged, matched, more)); }
            await refreshDatabase();
            setNotice(syncNotice(logged, matched, more, true));
          })}>{busy ? "Working…" : "Sync now"}</Button>
          <Button variant="quiet" disabled={busy} onClick={() => setDisconnecting(!disconnecting)}>Disconnect</Button>
          {(status.health?.needsReconnect??status.connection.last_error?.startsWith('Reconnect Gmail')) && <Button disabled={busy} onClick={() => void run(async () => { const result = await api("/connect", "POST", { startDate: status.connection!.start_date }); window.location.assign(result.url); })}>Reconnect Gmail</Button>}
        </div>
        <details className="text-xs text-ink-secondary"><summary className="min-h-11 cursor-pointer py-3">Sync details & troubleshooting</summary><div className="space-y-3 pb-2">
          <p>Importing alerts from {status.connection.start_date}. {status.health?.schedule}</p>
          <p>Checks cover supported bank alerts and investment confirmations. Dismissed, unsupported and unresolved emails are not confirmed imports.</p>
          <details><summary className="min-h-9 cursor-pointer py-2">Connection keeps expiring?</summary><p>Google apps in Testing can issue access that expires after seven days. Check <a className="underline" href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noreferrer">Google Auth Platform → Audience</a>, publish the OAuth app, then reconnect. Google can also revoke access after security or permission changes.</p></details>
        </div></details>
        {disconnecting && <div className="space-y-2 text-sm"><p>Stop automatic imports and revoke Google access? Your saved transactions and duplicate checks stay in the app.</p><Button variant="danger" disabled={busy} onClick={() => void run(async () => { await api("", "DELETE"); setDisconnecting(false); setNotice("Disconnected. Your saved transactions are unchanged."); })}>Disconnect Gmail</Button></div>}
      </>}
      {status?.connection&&<><GmailBackfill email={status.connection.email}/><FoodReceipts /></>}
      {!!status?.reviewCount && <p className="text-sm font-medium">{status.reviewCount} alerts need review{status.reviewCount > 50 ? " — showing the first 50" : ""}</p>}
      {status?.messages.map(mail => <ReviewItemRow key={mail.message_id} mail={mail} email={status.connection?.email} disabled={busy} onSaved={async () => { await load(); await refreshDatabase(); }} />)}
      {!!status?.possibleExistingCount&&<details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-medium">{status.possibleExistingCount} possible matches to review</summary><p className="mt-2 text-xs text-ink-secondary">Link these emails to the correct saved payment to avoid duplicates. Check more than just the amount and date.</p>{status.possibleExistingMessages?.map(mail=><ReviewItemRow key={mail.message_id} mail={mail} email={status.connection?.email} disabled={busy} onSaved={async()=>{await load();await refreshDatabase();}}/>)}</details>}
      {!!status?.categoryReviewCount&&<details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-medium">{status.categoryReviewCount} category suggestions</summary><p className="mt-2 text-xs text-ink-secondary">These payments are already recorded. Only their categories need review.</p>{status.categoryMessages?.map(mail=><ReviewItemRow key={mail.message_id} mail={mail} email={status.connection?.email} disabled={busy} onSaved={async()=>{await load();await refreshDatabase();}}/>)}</details>}

    </Card>
  </Section>;
}

function ReviewItemRow({ mail, email, disabled, onSaved }: { mail: ReviewItem; email?: string; disabled: boolean; onSaved: () => Promise<void> }) {
  if (isInvestmentNotice(mail.candidate)) return <InvestmentReviewRow mail={mail} notice={mail.candidate} email={email} disabled={disabled} onSaved={onSaved} />;
  const candidate = mail.candidate;
  return <ReviewRow key={`${mail.message_id}:${candidate?.accountId ?? ''}:${candidate?.creditKind ?? ''}`} mail={{...mail, candidate}} email={email} disabled={disabled} onSaved={onSaved} />;
}

function InvestmentReviewRow({ mail, notice, email, disabled, onSaved }: { mail: ReviewItem; notice: InvestmentNotice; email?: string; disabled: boolean; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="space-y-3 border-t border-line pt-4">
    <p className="text-sm font-medium">{notice.scheme}</p>
    <p className="text-xs text-ink-tertiary">{notice.provider} · {notice.kind === "investment-allocation" ? "Allocation confirmation" : "Upcoming SIP"}</p>
    {notice.netAmount !== undefined && <p className="text-sm">Allocated value: {formatMoney(notice.netAmount)}{notice.units ? ` · ${notice.units} units` : ""}</p>}
    {notice.orderId && <p className="break-all text-xs text-ink-tertiary">Order: {notice.orderId}</p>}
    <p className="text-sm text-ink-secondary">{mail.reason}</p>
    <p className="text-xs text-ink-tertiary">This confirms an investment. Link its bank payment; don’t add another expense.</p>
    <a className="text-sm underline" target="_blank" rel="noreferrer" href={`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email ?? "")}#all/${mail.message_id}`}>View original email</a>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div><Button size="sm" variant="quiet" disabled={disabled || busy} onClick={() => {
      setBusy(true); setError("");
      void api("/review", "POST", { action: "ignore", messageId: mail.message_id }).then(onSaved)
        .catch(e => setError(e instanceof Error ? e.message : "Could not save.")).finally(() => setBusy(false));
    }}>Already recorded / dismiss</Button></div>
  </div>;
}

function ReviewRow({ mail, email, disabled, onSaved }: { mail: ReviewMail; email?: string; disabled: boolean; onSaved: () => Promise<void> }) {
  const { db } = useFinance(); const a = mail.candidate;
  const defaults = reviewDefaults(a);
  const [accountId, setAccountId] = useState(defaults.accountId);
  const [chosenCategory, setCategoryId] = useState<string>();
  const categoryId = chosenCategory ?? mail.categorySuggestion?.categoryId ?? a?.classification?.categoryId ?? a?.categoryId ?? "";
  const suggestedCategory = db?.categories.find(category=>category.id===mail.categorySuggestion?.categoryId);
  const suggestedParent = db?.categories.find(category=>category.id===suggestedCategory?.parentId);
  const [kind, setKind] = useState(defaults.kind);
  const [toAccountId, setToAccountId] = useState(defaults.toAccountId);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [existingTransactionId, setExistingTransactionId] = useState(() => mail.suppress_suggested_match ? "" : (suggestedExistingEntry(a,db?.transactions??[]) ?? ""));
  const [remember, setRemember] = useState(false);
  const [learnCategory, setLearnCategory] = useState(true);
  const [refundPosted, setRefundPosted] = useState(false);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const inputClass = "min-w-0 max-w-full rounded-lg border border-line bg-surface p-2 text-sm";
  const matchingAccountId = a?.accountId || (a?.direction === "credit" && kind === "TRANSFER" ? toAccountId : accountId);
  const candidates = a && matchingAccountId ? possibleExistingTransactions(db?.transactions ?? [], matchingAccountId, a.amount, a.date, a.direction, a.reference) : [];
  async function submit(action: "log" | "ignore" | "match") {
    setBusy(true); setError("");
    try {
      if (action === "log" && remember) await api("/mapping", "POST", { messageId: mail.message_id, accountId });
      await api("/review", "POST", { action, messageId: mail.message_id, accountId: action === "match" ? matchingAccountId : accountId, categoryId, type: kind === "REFUND" ? "INCOME" : kind, isRefund: kind === "REFUND", toAccountId, allowDuplicate, existingTransactionId,learnCategory,refundPosted });
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3 border-t border-line pt-4">
    <p className="text-sm font-medium">{a ? `${a.merchant} · ${formatMoney(a.amount)} · ${a.date}` : mail.subject}</p>
    {a && <p className="text-xs text-ink-tertiary">{a.bank} {a.instrument.replace("_", " ")} ending {a.tail} · {alertTimeLabel({timeSource: a.timeSource ?? "unknown", timeConfidence: a.timeConfidence ?? "unknown", occurredAt: a.occurredAt})}</p>}
    <p className="text-sm text-ink-secondary">{mail.entryChanged ? 'This ledger entry changed after the original review. Check it in Transactions before changing its category.' : suggestedCategory ? `Suggested: ${suggestedParent?`${suggestedParent.name} / `:''}${suggestedCategory.name}` : mail.reason || "Check these details before adding."}</p>
    {a?.direction === 'credit' && a.instrument === 'bank' && !mail.category_review && <p className="text-sm text-warning">This incoming payment has not been added yet. Choose its purpose or link a saved entry.</p>}
    {a?.creditKind === 'repayment' && <p className="text-xs text-ink-secondary">Payment received: {formatMoney(a.amount)}. This can be a partial payment. It reduces the card balance by this amount; it is not new spending or income.</p>}
    {a?.refundStatus === 'initiated' && !mail.category_review && <>
      {a.refundInitiatedAt && <p className="text-xs text-ink-tertiary">Refund initiated {a.refundInitiatedAt.replace('T',' ')} IST. Posting time is unknown.</p>}
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={refundPosted} onChange={e=>setRefundPosted(e.target.checked)}/>I confirmed this refund is posted to my card with transaction date {a.date}.</label>
    </>}
    {mail.category_review&&<p className="text-xs text-ink-secondary">Already recorded. Saving changes only the category.</p>}
    {a && isInvestmentDebit(a) && <p className="text-xs text-ink-secondary">In Transactions, mark the bank payment as Invested, then link it here.</p>}
    {mail.categorySuggestion&&<details className="text-xs text-ink-tertiary"><summary className="cursor-pointer">Why this category?</summary><p className="mt-1">{mail.categorySuggestion.reason}</p></details>}
    {!mail.category_review&&a?.classification&&<details className="text-xs text-ink-secondary"><summary className="min-h-9 cursor-pointer py-2">Why this suggestion?</summary><p>{a.classification.reason}</p></details>}
    {mail.entryChanged&&<a className="text-sm underline" href="/transactions">Check ledger</a>}
    <a className="text-sm underline" target="_blank" rel="noreferrer" href={`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email ?? "")}#all/${mail.message_id}`}>View original email</a>
    {a && <>
      <div className="flex flex-wrap gap-2">
        {!mail.category_review&&<select aria-label="Transaction type" className={inputClass} value={kind} onChange={e => setKind(e.target.value)}><option value="">Choose type</option><option value="EXPENSE">Expense</option><option value="INCOME">Income</option><option value="REFUND">Refund</option><option value="TRANSFER">Transfer / card repayment</option></select>}
        {!mail.category_review&&<select aria-label="Account" className={inputClass} value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">{kind === "TRANSFER" ? "From account" : "Choose account"}</option>{db?.accounts.filter(a => a.isActive).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
        {kind === "TRANSFER" ? <select aria-label="Destination account" className={inputClass} value={toAccountId} onChange={e => setToAccountId(e.target.value)}><option value="">To account</option>{db?.accounts.filter(a => a.isActive && a.id !== accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select> : (kind === "EXPENSE" || kind === "REFUND") && <select aria-label="Category" className={inputClass} value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Choose category</option>{db?.categories.map(c => <option key={c.id} value={c.id}>{c.parentId ? `${db.categories.find(p => p.id === c.parentId)?.name} / ` : ""}{c.name}</option>)}</select>}
      </div>
      {kind === "EXPENSE"&&<label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={learnCategory} onChange={e=>setLearnCategory(e.target.checked)}/>Learn my chosen category for this payee</label>}
      {!mail.category_review&&kind !== "TRANSFER" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />Remember this card/account match for future alerts</label>}
      {!mail.category_review&&<label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={allowDuplicate} onChange={e => setAllowDuplicate(e.target.checked)} />This is a separate payment, even if its amount and date match.</label>}
      {!mail.category_review&&!!candidates.length && <div className="flex flex-wrap gap-2">
        <p className="w-full text-xs text-ink-secondary">{candidates.length === 1 ? 'A saved payment may match.' : 'Several saved payments may match.'} Check the original email before linking.</p>
        <select aria-label="Existing ledger entry" className={inputClass} value={existingTransactionId} onChange={e => setExistingTransactionId(e.target.value)}>
          <option value="">Choose an existing entry to link</option>
          {candidates.map(t => <option key={t.id} value={t.id}>{t.description} · {t.date.slice(0, 10)} · {formatMoney(t.amount)}</option>)}
        </select>
        <Button size="sm" disabled={disabled || busy || !existingTransactionId} onClick={() => void submit("match")}>Confirm link to existing entry</Button>
        <p className="text-xs text-ink-tertiary">Linking keeps the saved payment and adds no expense.</p>
      </div>}
    </>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="flex flex-wrap gap-2">{a && !isInvestmentDebit(a) && <Button size="sm" disabled={disabled || busy || mail.entryChanged || !accountId || !kind || (['EXPENSE','REFUND'].includes(kind)&&!categoryId) || (kind === 'TRANSFER' && (!toAccountId || accountId === toAccountId)) || (!mail.category_review && a.refundStatus === 'initiated' && !refundPosted)} onClick={() => void submit("log")}>{mail.category_review?(mail.categorySuggestion?.categoryId===categoryId?'Apply suggested category':'Save category'):'Add to ledger'}</Button>}<Button size="sm" variant="quiet" disabled={disabled || busy} onClick={() => void submit("ignore")}>{mail.category_review?'Keep current entry':'Dismiss email'}</Button></div>
  </div>;
}
