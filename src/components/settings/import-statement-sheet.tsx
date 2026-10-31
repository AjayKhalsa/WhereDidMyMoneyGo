"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Upload } from "lucide-react";
import { formatDayMonth } from "@/lib/domain/dates";
import { useMoneyText } from '@/lib/hooks/use-privacy';
import { deleteTransactions, importTransactions } from "@/lib/data/actions";
import { sourceDigest } from "@/lib/import/identity";
import {possibleRecordedSplits,recordedSplitGroups} from '@/lib/import/split-settlements';
import {reviewCreditPurpose,reviewImportCategory,type CreditPurpose} from '@/lib/import/credit-purpose';
import {
  buildImportDrafts,
  type ImportDraft,
} from "@/lib/import/build-drafts";
import { parseHdfcStatement } from "@/lib/import/hdfc-parser";
import { UnreadableStatementError } from "@/lib/import/statement-row";
import {
  extractPdfRows,
  PdfCancelledError,
  ScannedPdfError,
} from "@/lib/import/pdf-text";
import { extractXlsRows } from "@/lib/import/xls-source";
import { parseStatementXls } from "@/lib/import/parse-statement-xls";
import { useFinance } from "@/lib/hooks/use-finance";
import { Button, Chip } from "@/components/ui/primitives";
import { TextField } from "@/components/ui/fields";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { AccountPicker, CategoryPicker } from "@/components/pickers/pickers";
import {TransactionList} from '@/components/transactions/transaction-list';

/**
 * Statement import — deliberately minimal (spec: bank-statement-import plan).
 *
 * Two input paths feeding the same bank-agnostic pipeline
 * (`narration.ts` -> `build-drafts.ts`): HDFC PDFs (`pdf-text.ts` ->
 * `hdfc-parser.ts`, x/y coordinate reconstruction) and bank "Excel" exports
 * — HDFC/ICICI/Axis so far (`xls-source.ts` -> `parse-statement-xls.ts`,
 * plain column lookup by header name, no coordinate guessing). XLS statement
 * exports have proven far more reliable than PDF table-scraping in
 * practice. A new bank is a new `*-xls-parser.ts`, not a rewrite of this
 * screen. No fancy grid, no bulk select-by-confidence — a plain reviewable
 * list, because getting a working version in your hands mattered more than
 * polish.
 */

type ReviewRow = ImportDraft & { included: boolean; wasCorrected: boolean; sourceKey: string; existingTransactionId?: string; allowSeparate?: boolean };
type Step = "account" | "upload" | "parsing" | "review";

function isoDateToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function ImportStatementSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { db, categories } = useFinance();
  const toast = useToast();
  const money=useMoneyText();

  const [step, setStep] = useState<Step>("account");
  const [accountId, setAccountId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [routingRow, setRoutingRow] = useState<number | null>(null);
  const [creditRow,setCreditRow]=useState<number|null>(null);
  const [committing, setCommitting] = useState(false);
  const [sourceHash, setSourceHash] = useState("");
  const [splitSelection,setSplitSelection]=useState<{index:number;id:string}|null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const splitGroups=useMemo(()=>recordedSplitGroups(db?.transactions??[]),[db?.transactions]);
  const splitMatches=useMemo(()=>rows.map(row=>possibleRecordedSplits(splitGroups,accountId??'',row.amount,row.date,row.direction,row.reference)),[rows,splitGroups,accountId]);
  const selectedSplit=splitSelection?splitMatches[splitSelection.index]?.find(group=>group.id===splitSelection.id):undefined;
  const unreviewedSplits=rows.filter((row,index)=>row.included&&splitMatches[index]?.length&&!row.allowSeparate&&!row.existingTransactionId).length;

  const [passwordPrompt, setPasswordPrompt] = useState<{ isRetry: boolean } | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const passwordResolver = useRef<{ resolve: (v: string) => void; reject: () => void } | null>(
    null,
  );

  const accountName = (id: string) =>
    db?.accounts.find((a) => a.id === id)?.name ?? "account";

  function reset() {
    setStep("account");
    setAccountId(undefined);
    setError(null);
    setRows([]);
    setSourceHash("");
    setSplitSelection(null);
    setEditingRow(null);
    setRoutingRow(null);
    setCreditRow(null);
    setPasswordPrompt(null);
  }

  function requestPassword(isRetry: boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      passwordResolver.current = { resolve, reject };
      setPasswordInput("");
      setPasswordPrompt({ isRetry });
    });
  }

  function submitPassword() {
    passwordResolver.current?.resolve(passwordInput);
    passwordResolver.current = null;
    setPasswordPrompt(null);
  }

  function cancelPassword() {
    passwordResolver.current?.reject();
    passwordResolver.current = null;
    setPasswordPrompt(null);
  }

  async function handleFile(file: File) {
    setStep("parsing");
    setError(null);
    const isXls = /\.xlsx?$/i.test(file.name);
    try {
      const fileHash = await sourceDigest(await file.arrayBuffer());
      setSourceHash(fileHash);
      const statementRows = isXls
        ? parseStatementXls(await extractXlsRows(file))
        : parseHdfcStatement(await extractPdfRows(file, requestPassword));
      const drafts = buildImportDrafts(
        statementRows,
        accountId!,
        db?.transactions ?? [],
        db?.rules ?? [],
      );
      setRows(
        drafts.map((d, index) => ({ ...d, included: !d.needsCreditReview && !d.isLikelyDuplicate && d.possibleMatchIds.length === 0 && d.possibleSplitIds.length===0,
          sourceKey: `${accountId}:${fileHash}:${index}`, wasCorrected: false })),
      );
      setStep("review");
    } catch (err) {
      if (err instanceof PdfCancelledError) {
        setStep("upload");
        return;
      }
      if (err instanceof UnreadableStatementError) {
        setError(err.message);
        // Not shown in the UI — logged so the raw extracted rows can be
        // copied out of DevTools to diagnose why detection failed, without
        // needing the actual file.
        console.error("[import] statement diagnostics:", err.diagnostics);
      } else if (err instanceof ScannedPdfError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Couldn't read that file.");
      }
      setStep("upload");
    }
  }

  const includedCount = rows.filter((r) => r.included).length;
  // A statement shows money leaving, never where it went. Committing a
  // transfer with no destination debits the bank and credits nothing, so a
  // card payment would leave the card's outstanding untouched forever.
  const unresolvedTransfers = rows.filter(
    (r) => r.included && !r.existingTransactionId && r.type === "TRANSFER" && !(r.direction==='credit'?r.fromAccountId:r.toAccountId),
  ).length;
  const unresolvedCredits=rows.filter(r=>r.included&&r.needsCreditReview&&!r.existingTransactionId).length;
  const routingCredit=routingRow!==null&&rows[routingRow]?.direction==='credit';
  const detailOpen=!!selectedSplit||creditRow!==null||editingRow!==null||routingRow!==null;

  function chooseCreditPurpose(purpose:CreditPurpose) {
    if(creditRow===null)return;
    setRows(current=>current.map((row,i)=>i===creditRow?{...reviewCreditPurpose(row,purpose),wasCorrected:true,
      included:row.included||!!row.allowSeparate||(!row.possibleMatchIds.length&&!splitMatches[i]?.length)}:row));
    setCreditRow(null);
  }

  async function handleCommit() {
    if (!accountId || includedCount === 0 || unresolvedTransfers > 0 || unreviewedSplits>0 || unresolvedCredits>0) return;
    setCommitting(true);
    try {
      const included = rows.filter((r) => r.included);
      const result = await importTransactions(
        included.map((r) => ({
          draft: {
            type: r.type,
            amount: r.amount,
            description: r.description,
            date: isoDateToLocalDate(r.date),
            categoryId: r.categoryId,
            contexts: r.contexts,
            accountId:r.type==='TRANSFER'&&r.direction==='credit'?r.fromAccountId:accountId,
            toAccountId:r.type==='TRANSFER'&&r.direction==='credit'?accountId:r.toAccountId,
            isRefund:r.isRefund,
            merchant: r.merchant,
            source: "imported",
          },
          wasCorrected: r.wasCorrected,
          matchedRuleId: r.matchedRuleId,
          observation: { kind: "statement", key: r.sourceKey, accountId, direction: r.direction,
            date: r.date, reference: r.reference, payloadHash: sourceHash,
            existingTransactionId: r.existingTransactionId, allowSeparate: r.allowSeparate },
        })),
      );
      toast.show({
        tone: "success",
        title: `${result.created.length} new transaction${result.created.length === 1 ? "" : "s"} imported`,
        detail: `${result.matched} existing entries kept${result.removed ? `; ${result.removed} previously removed entries left for review` : ""}.`,
        action: result.created.length ? {
          label: "Undo",
          onClick: () => {
            void deleteTransactions(result.created.map((t) => t.id));
          },
        } : undefined,
      });
      reset();
      onClose();
    } catch (err) {
      toast.show({
        tone: "error",
        title: "Import failed",
        detail: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCommitting(false);
    }
  }

  return (
    <>
      <Sheet
        open={open&&!detailOpen}
        onClose={() => {
          reset();
          onClose();
        }}
        title="Import a statement"
        description="HDFC, ICICI, or Axis — Excel export or HDFC PDF"
        size="lg"
        variant="full"
        footer={
          step === "review" ? (
            <Button
              variant="primary"
              block
              onClick={handleCommit}
              disabled={includedCount === 0 || committing || unresolvedTransfers > 0 || unreviewedSplits>0 || unresolvedCredits>0}
            >
              {committing
                ? "Importing…"
                : unreviewedSplits>0
                  ? 'Review possible split payouts'
                : unresolvedCredits>0
                  ? 'Review received money'
                : unresolvedTransfers > 0
                  ? `${unresolvedTransfers} transfer${unresolvedTransfers === 1 ? "" : "s"} need${unresolvedTransfers === 1 ? "s" : ""} an account`
                  : `Import ${includedCount} transaction${includedCount === 1 ? "" : "s"}`}
            </Button>
          ) : undefined
        }
      >
        {step === "account" && (
          <div className="space-y-4 py-1">
            <p className="text-[13px] font-medium text-ink-secondary">
              Which account is this statement for?
            </p>
            <AccountPicker
              accounts={(db?.accounts ?? []).filter((a) => a.isActive)}
              value={accountId}
              onChange={setAccountId}
            />
            <Button
              variant="primary"
              block
              onClick={() => setStep("upload")}
              disabled={!accountId}
            >
              Continue
            </Button>
          </div>
        )}

        {step === "upload" && (
          <div className="space-y-4 py-1">
            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-danger-soft p-3.5 text-[13px] text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span>{error}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface/50 px-6 py-12 text-center transition-colors hover:bg-surface-hover"
            >
              <Upload className="h-6 w-6 text-ink-tertiary" strokeWidth={1.5} />
              <span className="text-[14px] font-medium text-ink">Choose a statement file</span>
              <span className="text-[12.5px] text-ink-tertiary">
                Excel (.xls/.xlsx) export from HDFC, ICICI, or Axis, or an HDFC PDF —
                password-protected PDFs are fine, you&rsquo;ll be asked and it never leaves this
                browser.
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {step === "parsing" && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-ink-tertiary" strokeWidth={1.75} />
            <p className="text-[13.5px] text-ink-secondary">Reading the statement…</p>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-1 py-1">
            <p className="mb-2 text-[12.5px] text-ink-tertiary">
              {rows.length} rows found. Possible existing entries are unchecked. Link a saved entry,
              or confirm a separate payment when appropriate. Tap a category to change it, or to
              turn an outgoing transfer back into spending. Unclear credits need a type.
              {unresolvedTransfers > 0 &&
                " Transfers need to say where the money landed before you can import."}
            </p>
            {rows.map((row, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-hover"
              >
                <input
                  type="checkbox"
                  aria-label={`Include statement row ${index+1}`}
                  checked={row.included}
                  disabled={committing||(!row.existingTransactionId&&(row.needsCreditReview||!!splitMatches[index]?.length&&!row.allowSeparate))}
                  onChange={(e) =>
                    setRows((current) =>
                      current.map((r, i) =>
                        i === index ? { ...r, included: e.target.checked } : r,
                      ),
                    )
                  }
                  className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="w-12 shrink-0 text-[12px] text-ink-tertiary tnum">
                  {formatDayMonth(isoDateToLocalDate(row.date))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-ink">{row.description}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                    <button type="button" disabled={!!row.existingTransactionId} title={row.existingTransactionId?'The saved entry keeps its type and category':undefined} aria-label={`Review type or category for row ${index+1}`} onClick={() => row.direction==='credit'?setCreditRow(index):setEditingRow(index)}>
                      <Chip tone={row.needsCreditReview?'warning':row.wasCorrected ? "accent" : "neutral"}>
                        {row.existingTransactionId?'Existing entry':row.direction==='credit'?(row.needsCreditReview?'Choose type':row.isRefund?'Refund':row.type==='TRANSFER'?'Transfer in':'Income'):row.type === "EXPENSE"
                          ? categories.pathOf(row.categoryId)
                          : row.type}
                      </Chip>
                    </button>
                    {row.isRefund&&!row.existingTransactionId&&<button type="button" aria-label={`Refund category for row ${index+1}`} onClick={()=>setEditingRow(index)}><Chip>{categories.pathOf(row.categoryId)}</Chip></button>}
                    {row.type === "TRANSFER" && !row.existingTransactionId && (
                      <button
                        type="button"
                        onClick={() => setRoutingRow(index)}
                      >
                        <Chip tone={(row.direction==='credit'?row.fromAccountId:row.toAccountId) ? "neutral" : "warning"}>
                          {row.direction==='credit'?(row.fromAccountId?`From ${accountName(row.fromAccountId)}`:'Where did this come from?'):row.toAccountId?`→ ${accountName(row.toAccountId)}`:'Where did this go?'}
                        </Chip>
                      </button>
                    )}
                    {row.isLikelyDuplicate && (
                      <Chip tone="warning">Looks like a duplicate</Chip>
                    )}
                    {(splitMatches[index]??[]).map(group=><button key={group.id} type="button" onClick={()=>setSplitSelection({index,id:group.id})} className="min-h-11 text-left text-xs underline underline-offset-4" aria-label={`Review recorded split for row ${index+1}`}>
                      Possible recorded split · {group.rows.length} entries
                    </button>)}
                    {!!row.possibleMatchIds.length && <select
                      aria-label={`Match existing entry for row ${index + 1}`}
                      className="max-w-full rounded-lg border border-line bg-surface p-1 text-xs"
                      value={row.existingTransactionId ?? ""}
                      onChange={(e) => setRows((current) => current.map((r, i) => i === index
                        ? { ...r, existingTransactionId: e.target.value || undefined, included: !!e.target.value, allowSeparate: false } : r))}>
                      <option value="">Possible existing entry — choose a match</option>
                      {row.possibleMatchIds.map((id) => { const t = db?.transactions.find((t) => t.id === id);
                        return t ? <option key={id} value={id}>{t.description} · {t.date.slice(0, 10)} · {money(t.amount)}</option> : null; })}
                    </select>}
                    {(!!row.possibleMatchIds.length||!!splitMatches[index]?.length) && <label className="flex min-h-11 items-center gap-1 text-xs text-ink-tertiary">
                      <input type="checkbox" checked={row.allowSeparate ?? false}
                        disabled={committing}
                        aria-label={`Confirm separate payment for row ${index+1}`}
                        onChange={(e) => setRows((current) => current.map((r, i) => i === index
                          ? { ...r, allowSeparate: e.target.checked, existingTransactionId: undefined, included: e.target.checked } : r))} />
                      I checked: this is a separate payment
                    </label>}
                  </span>
                </span>
                <span className="shrink-0 text-[13.5px] font-medium tnum text-ink">
                  {row.direction === "debit" ? "−" : "+"}
                  {money(row.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Sheet>

      <Sheet open={open&&creditRow!==null} onClose={()=>setCreditRow(null)} title="What is this money received?" size="sm">
        <div className="space-y-2">
          {creditRow!==null&&rows[creditRow]?.suggestedCreditPurpose==='refund'&&<p className="mb-3 text-sm text-ink-secondary">The bank narration suggests a refund. Confirm its purpose.</p>}
          <button type="button" onClick={()=>chooseCreditPurpose('income')} className="block min-h-14 w-full rounded-xl border border-line p-3 text-left"><span className="block font-medium">Income</span><span className="text-xs text-ink-secondary">Salary, interest or money earned</span></button>
          <button type="button" onClick={()=>chooseCreditPurpose('refund')} className="block min-h-14 w-full rounded-xl border border-line p-3 text-left"><span className="block font-medium">Refund</span><span className="text-xs text-ink-secondary">Money returned against spending</span></button>
          <button type="button" onClick={()=>chooseCreditPurpose('transfer')} className="block min-h-14 w-full rounded-xl border border-line p-3 text-left"><span className="block font-medium">Own-account transfer</span><span className="text-xs text-ink-secondary">From another bank or cash account you track</span></button>
        </div>
      </Sheet>

      <Sheet open={open&&!!selectedSplit} onClose={()=>setSplitSelection(null)} title="Possible recorded split" size="lg">
        {selectedSplit&&<><p className="mb-2 text-xl font-semibold">{money(selectedSplit.total)} across {selectedSplit.rows.length} entries</p><p className="mb-5 text-sm text-ink-secondary">These entries explicitly name each other and match this statement total. If they represent this payout, leave the statement row unchecked. No new source link is saved.</p><TransactionList transactions={selectedSplit.rows} showDayTotals={false} showTime/></>}
      </Sheet>

      <Sheet
        open={passwordPrompt !== null}
        onClose={cancelPassword}
        title="This PDF is password-protected"
        description={
          passwordPrompt?.isRetry
            ? "That password wasn't right — try again."
            : "Stays in your browser — never sent anywhere."
        }
        size="sm"
        footer={
          <Button variant="primary" block onClick={submitPassword} disabled={!passwordInput}>
            Unlock
          </Button>
        }
      >
        <TextField
          label="Password"
          type="password"
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && passwordInput) submitPassword();
          }}
          data-autofocus
        />
      </Sheet>

      <Sheet
        open={open&&editingRow !== null}
        onClose={() => setEditingRow(null)}
        title="Category"
        size="md"
      >
        <CategoryPicker
          value={editingRow !== null ? rows[editingRow]?.categoryId : undefined}
          onChange={(id) => {
            if (editingRow === null) return;
            setRows((current) =>
              current.map((r, i) =>
                i === editingRow
                  ? // Refine a refund or reclassify an outgoing payment.
                    // A credit must keep its incoming financial direction.
                    {...reviewImportCategory(r,id),wasCorrected:true}
                  : r,
              ),
            );
            setEditingRow(null);
          }}
        />
      </Sheet>

      <Sheet
        open={open&&routingRow !== null}
        onClose={() => setRoutingRow(null)}
        title={routingCredit?'Where did this money come from?':'Where did this money go?'}
        description={routingCredit?'Choose the bank or cash account you moved this from. Both sides are recorded as one transfer.':'Pick the card or account it landed in, so both sides move.'}
        size="sm"
      >
        <AccountPicker
          accounts={(db?.accounts ?? []).filter(
            (a) => a.isActive && a.id !== accountId && (!routingCredit||a.type==='BANK'||a.type==='CASH'),
          )}
          value={routingRow !== null ? routingCredit?rows[routingRow]?.fromAccountId:rows[routingRow]?.toAccountId : undefined}
          onChange={(id) => {
            if (routingRow === null) return;
            setRows((current) =>
              current.map((r, i) =>
                i === routingRow ? { ...r, ...(routingCredit?{fromAccountId:id}:{toAccountId:id}) } : r,
              ),
            );
            setRoutingRow(null);
          }}
        />
      </Sheet>
    </>
  );
}
