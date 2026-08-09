"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { UNCATEGORISED_ID } from "@/lib/domain/categories";
import { contextLabel } from "@/lib/domain/contexts";
import { toDateInputValue } from "@/lib/domain/dates";
import { formatMoney, formatMoneyPrecise, parseAmountInput } from "@/lib/domain/money";
import type {
  Transaction,
  TransactionContext,
  TransactionType,
} from "@/lib/domain/types";
import {
  addTransaction,
  deleteTransaction,
  recordSplits,
  updateTransaction,
  type TransactionDraft,
} from "@/lib/data/actions";
import { canQuickSave, parseExpenseInput } from "@/lib/engine/parser";
import {
  shouldAskForHelp,
  suggestClassification,
  type Suggestion,
} from "@/lib/data/ai-classifier";
import { useFinance } from "@/lib/hooks/use-finance";
import { cn } from "@/lib/utils";
import { Amount } from "@/components/ui/amount";
import { SegmentedControl, TextField } from "@/components/ui/fields";
import { Button, Chip, SelectableChip } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import {
  AccountPicker,
  CategoryPicker,
  ContextPicker,
  PersonPicker,
} from "@/components/pickers/pickers";
import type { AddSheetOptions } from "./add-sheet-provider";

/**
 * Even split of a total across you + N other people, in paise.
 *
 * You (the payer) absorb the rounding remainder rather than splitting paisa
 * fractionally — simplest deterministic rule, stated once here.
 */
function computeSplitShares(totalPaise: number, otherCount: number) {
  const peopleCount = otherCount + 1;
  if (peopleCount <= 1 || totalPaise <= 0) {
    return { yourShare: totalPaise, otherShare: 0 };
  }
  const otherShare = Math.floor(totalPaise / peopleCount);
  const yourShare = totalPaise - otherShare * otherCount;
  return { yourShare, otherShare };
}

/**
 * The add-expense experience (spec §12, §13, §38).
 *
 * The design goal is a few seconds, one hand, no navigation. You type
 * "2400 dinner with friends", the app shows you what it understood, you tap
 * Save. There is no category screen, no subcategory screen and no payment
 * method screen in that path — everything is inferred and every inference is
 * visible and one tap away from being corrected.
 *
 * The detail controls exist, but they are collapsed behind "More" so the
 * common case stays a single line of text.
 */

const QUICK_ENTRIES: { label: string; text: string }[] = [
  { label: "Food", text: "lunch" },
  { label: "Cab", text: "uber" },
  { label: "Coffee", text: "coffee" },
  { label: "Groceries", text: "groceries" },
  { label: "Movie", text: "movie" },
  { label: "Drinks", text: "drinks with friends" },
];

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: "EXPENSE", label: "Spent" },
  { value: "INCOME", label: "Earned" },
  { value: "INVESTMENT", label: "Invested" },
  { value: "TRANSFER", label: "Moved" },
];

interface DraftState {
  type: TransactionType;
  amountText: string;
  description: string;
  categoryId: string;
  contexts: TransactionContext[];
  accountId?: string;
  toAccountId?: string;
  merchant?: string;
  investmentId?: string;
  notes: string;
  date: string;
}

export function AddTransactionSheet({
  open,
  onClose,
  options,
}: {
  open: boolean;
  onClose: () => void;
  options: AddSheetOptions;
}) {
  const { db, categories } = useFinance();
  const toast = useToast();
  const editing = options.transaction;

  const [text, setText] = useState(options.initialText ?? "");
  const [saving, setSaving] = useState(false);
  const [showDetail, setShowDetail] = useState(Boolean(editing));
  const [panel, setPanel] = useState<"category" | "context" | null>(null);
  const [touched, setTouched] = useState<Set<keyof DraftState>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- Split with… ---------------------------------------------------------
  // New entries only (spec-consistent scoping: retro-splitting an already
  // saved transaction is a different, riskier operation — not this sheet).
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitTotalText, setSplitTotalText] = useState("");
  const [splitPersonIds, setSplitPersonIds] = useState<string[]>([]);
  const people = db?.people ?? [];

  const [draft, setDraft] = useState<DraftState>(() =>
    editing
      ? {
          type: editing.type,
          amountText: String(editing.amount / 100),
          description: editing.description,
          categoryId: editing.categoryId ?? UNCATEGORISED_ID,
          contexts: editing.contexts,
          accountId: editing.accountId,
          toAccountId: editing.toAccountId,
          merchant: editing.merchant,
          investmentId: editing.investmentId,
          notes: editing.notes ?? "",
          date: toDateInputValue(editing.date),
        }
      : {
          type: "EXPENSE",
          amountText: "",
          description: "",
          categoryId: UNCATEGORISED_ID,
          contexts: [],
          accountId: undefined,
          notes: "",
          date: toDateInputValue(new Date()),
        },
  );

  const markTouched = (field: keyof DraftState) =>
    setTouched((current) => new Set(current).add(field));

  const patch = (changes: Partial<DraftState>) =>
    setDraft((current) => ({ ...current, ...changes }));

  // ---- Live interpretation ------------------------------------------------
  const parsed = useMemo(() => {
    if (editing || !text.trim()) return null;
    return parseExpenseInput(text, {
      rules: db?.rules ?? [],
      date: new Date(draft.date),
    });
  }, [text, db?.rules, editing, draft.date]);

  /**
   * The parser drives the draft, but only for fields the user hasn't taken
   * over. Once you correct the category by hand, further typing must not
   * silently undo your correction.
   */
  useEffect(() => {
    if (!parsed) return;
    setDraft((current) => {
      const next = { ...current };
      if (!touched.has("amountText") && parsed.amount !== null) {
        next.amountText = String(parsed.amount / 100);
      }
      if (!touched.has("categoryId")) next.categoryId = parsed.categoryId;
      if (!touched.has("contexts")) next.contexts = parsed.contexts;
      if (!touched.has("merchant")) next.merchant = parsed.merchant;
      if (!touched.has("type")) next.type = parsed.type;
      if (!touched.has("description")) next.description = parsed.description;
      return next;
    });
  }, [parsed, touched]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Recomputes your share whenever the total or the people list changes.
  // The displayed/saved amount becomes your share, not the total you paid —
  // that's the whole point (see `recordSplits` in `data/actions.ts`).
  useEffect(() => {
    if (!splitEnabled || splitPersonIds.length === 0) return;
    const total = parseAmountInput(splitTotalText) ?? 0;
    if (total <= 0) return;
    const { yourShare } = computeSplitShares(total, splitPersonIds.length);
    setDraft((current) => ({ ...current, amountText: String(yourShare / 100) }));
    markTouched("amountText");
  }, [splitEnabled, splitPersonIds, splitTotalText]);

  function toggleSplit() {
    if (splitEnabled) {
      // Turning it off restores the full total as the amount — the split
      // maths shouldn't leave a silently-shrunk figure behind.
      if (splitTotalText) {
        patch({ amountText: splitTotalText });
        markTouched("amountText");
      }
      setSplitEnabled(false);
      setSplitPersonIds([]);
    } else {
      setSplitTotalText(draft.amountText);
      setSplitEnabled(true);
    }
  }

  // ---- Assistant fallback -------------------------------------------------
  /**
   * Asks the model for a second opinion, but only for the tail the rule engine
   * genuinely cannot reach (see `shouldAskForHelp`). The deterministic guess is
   * already on screen and stays authoritative — this arrives late and waits to
   * be tapped rather than rewriting the sheet under the user's hands.
   *
   * Debounced so it fires once you stop typing, not once per keystroke.
   */
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  useEffect(() => {
    setSuggestion(null);
    if (editing || !parsed || !shouldAskForHelp(parsed)) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void suggestClassification(text, controller.signal).then((result) => {
        // Ignore anything that agrees with the parser — showing "the assistant
        // also thinks Uncategorised" is noise, not help.
        if (result && result.categoryId !== parsed.categoryId) {
          setSuggestion(result);
        }
      });
    }, 650);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, parsed, editing]);

  function applySuggestion(accepted: Suggestion) {
    // Marking these touched is what makes the save count as a correction, so
    // `learnFromEntry` writes a local rule and this phrase never needs the
    // model again.
    patch({
      categoryId: accepted.categoryId,
      contexts: [...draft.contexts, ...accepted.contexts].filter(
        (context, index, all) =>
          all.findIndex((c) => c.value === context.value) === index,
      ),
      merchant: accepted.merchant ?? draft.merchant,
    });
    markTouched("categoryId");
    markTouched("contexts");
    setSuggestion(null);
  }

  const amount = parseAmountInput(draft.amountText) ?? 0;
  const isExpense = draft.type === "EXPENSE";
  const accounts = db?.accounts ?? [];
  const investments = (db?.investments ?? []).filter((i) => i.isActive);

  const wasCorrected =
    touched.has("categoryId") || touched.has("contexts") || touched.has("merchant");

  const confident = parsed ? canQuickSave(parsed) && !wasCorrected : false;

  const canSave =
    amount > 0 &&
    (!isExpense || draft.categoryId !== UNCATEGORISED_ID || touched.has("categoryId")) &&
    (draft.type !== "TRANSFER" || Boolean(draft.toAccountId && draft.accountId));

  // ---- Persistence --------------------------------------------------------
  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);

    const when = new Date(draft.date);
    // Keep the original time when editing; stamp "now" for fresh entries so
    // time-of-day insights have something real to work with.
    if (editing) {
      const original = new Date(editing.date);
      when.setHours(original.getHours(), original.getMinutes(), 0, 0);
    } else {
      const now = new Date();
      when.setHours(now.getHours(), now.getMinutes(), 0, 0);
    }

    const payload: TransactionDraft = {
      type: draft.type,
      amount,
      description: draft.description || (isExpense ? "Expense" : "Transaction"),
      date: when,
      categoryId: isExpense || draft.type === "INCOME" ? draft.categoryId : undefined,
      contexts: draft.contexts,
      accountId: draft.accountId,
      toAccountId: draft.toAccountId,
      merchant: draft.merchant,
      investmentId: draft.investmentId,
      notes: draft.notes,
      source: editing ? editing.source : parsed ? "parsed" : "manual",
    };

    try {
      if (editing) {
        await updateTransaction(editing.id, payload, { wasCorrected: true });
        toast.show({
          tone: "success",
          title: `${formatMoney(amount)} updated`,
          detail: summaryLine(draft, categories.pathOf),
        });
      } else {
        const created = await addTransaction(payload, {
          matchedRuleId: parsed?.matchedRuleId,
          wasCorrected,
        });

        let splitDetail = "";
        if (splitEnabled && splitPersonIds.length > 0) {
          const total = parseAmountInput(splitTotalText) ?? 0;
          const { otherShare } = computeSplitShares(total, splitPersonIds.length);
          await recordSplits(
            created.id,
            splitPersonIds.map((personId) => ({
              personId,
              direction: "OWED_TO_ME" as const,
              amount: otherShare,
            })),
          );
          splitDetail = ` · split with ${splitPersonIds.length === 1 ? "1 person" : `${splitPersonIds.length} people`}`;
        }

        toast.show({
          tone: "success",
          title: `${formatMoney(amount)} saved`,
          detail: summaryLine(draft, categories.pathOf) + splitDetail,
        });
      }
      onClose();
    } catch (error) {
      toast.show({
        tone: "error",
        title: "Couldn't save that",
        detail: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    setSaving(true);
    try {
      await deleteTransaction(editing.id);
      toast.show({ tone: "info", title: "Transaction deleted" });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit transaction" : "Add"}
      description={
        editing ? undefined : "Type it the way you'd say it out loud"
      }
      size="md"
      footer={
        <div className="flex items-center gap-2">
          {editing && (
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={saving}
              aria-label="Delete transaction"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          )}
          <Button
            variant="primary"
            block
            size="lg"
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? (
              "Saving…"
            ) : editing ? (
              "Save changes"
            ) : confident ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2.25} />
                Save {formatMoney(amount)}
              </>
            ) : (
              <>
                Save {amount > 0 ? formatMoney(amount) : ""}
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pt-1">
        {/* Amount is the loudest thing on the sheet. */}
        <div className="flex min-h-[68px] items-center justify-center pt-1">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={amount > 0 ? "value" : "placeholder"}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {amount > 0 ? (
                <Amount value={amount} size="xl" />
              ) : (
                <span className="display-figure text-[clamp(1.75rem,5vw,2.25rem)] font-semibold text-ink-faint">
                  ₹0
                </span>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {!editing && (
          <TextField
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) {
                e.preventDefault();
                void handleSave();
              }
            }}
            placeholder="2400 dinner with friends"
            aria-label="Describe the transaction"
            autoComplete="off"
            className="h-12 text-[16px]"
            data-autofocus
          />
        )}

        {/* Quick starters, only while the field is untouched. */}
        <AnimatePresence initial={false}>
          {!editing && !text.trim() && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ENTRIES.map((entry) => (
                  <SelectableChip
                    key={entry.label}
                    onClick={() => {
                      setText(`${entry.text} `);
                      inputRef.current?.focus();
                    }}
                  >
                    {entry.label}
                  </SelectableChip>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* What the app understood. Every chip here is tappable. */}
        {(amount > 0 || draft.categoryId !== UNCATEGORISED_ID || editing) && (
          <Interpretation
            draft={draft}
            parsedConfidence={parsed?.confidence ?? null}
            reasons={parsed?.reasons ?? []}
            categoryPath={categories.pathOf(draft.categoryId)}
            onEditCategory={() => setPanel("category")}
            onEditContexts={() => setPanel("context")}
            showCategory={isExpense || draft.type === "INCOME"}
          />
        )}

        {/* Second opinion, only when the rule engine came up short. */}
        <AnimatePresence initial={false}>
          {suggestion && !touched.has("categoryId") && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/25 bg-accent-soft/50 p-3"
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink">
                  Try {categories.pathOf(suggestion.categoryId)}?
                </span>
                <span className="mt-0.5 block text-[12px] text-ink-secondary">
                  {suggestion.reason}
                </span>
              </span>
              <span className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => setSuggestion(null)}
                >
                  No
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => applySuggestion(suggestion)}
                >
                  Use it
                </Button>
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Alternatives the parser considered — one tap to switch. */}
        {parsed && parsed.alternatives.length > 0 && !touched.has("categoryId") && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] text-ink-tertiary">Or:</span>
            {parsed.alternatives.slice(0, 3).map((alt) => (
              <SelectableChip
                key={alt}
                onClick={() => {
                  patch({ categoryId: alt });
                  markTouched("categoryId");
                }}
              >
                {categories.nameOf(alt)}
              </SelectableChip>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          className="flex items-center gap-1 text-[13px] font-medium text-ink-secondary transition-colors hover:text-ink"
          aria-expanded={showDetail}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              showDetail && "rotate-180",
            )}
            strokeWidth={1.75}
          />
          {showDetail ? "Fewer details" : "More details"}
        </button>

        <AnimatePresence initial={false}>
          {showDetail && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="space-y-4 pb-1">
                <SegmentedControl
                  label="Transaction type"
                  value={draft.type}
                  onChange={(value) => {
                    patch({ type: value });
                    markTouched("type");
                  }}
                  options={TYPE_OPTIONS}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Amount"
                    value={draft.amountText}
                    onChange={(e) => {
                      patch({ amountText: e.target.value });
                      markTouched("amountText");
                    }}
                    inputMode="decimal"
                    prefix="₹"
                    className="tnum"
                  />
                  <TextField
                    label="Date"
                    type="date"
                    value={draft.date}
                    max={toDateInputValue(new Date())}
                    onChange={(e) => patch({ date: e.target.value })}
                  />
                </div>

                <TextField
                  label="Description"
                  value={draft.description}
                  onChange={(e) => {
                    patch({ description: e.target.value });
                    markTouched("description");
                  }}
                  placeholder="Dinner with friends"
                />

                <TextField
                  label="Merchant"
                  value={draft.merchant ?? ""}
                  onChange={(e) => {
                    patch({ merchant: e.target.value });
                    markTouched("merchant");
                  }}
                  placeholder="Optional"
                />

                {isExpense && !editing && (
                  <div className="space-y-2 rounded-xl border border-line p-3.5">
                    <button
                      type="button"
                      onClick={toggleSplit}
                      className="flex w-full items-center justify-between text-[13px] font-medium text-ink-secondary"
                    >
                      <span>Split with…</span>
                      <Chip tone={splitEnabled ? "accent" : "neutral"}>
                        {splitEnabled ? "On" : "Off"}
                      </Chip>
                    </button>

                    {splitEnabled && (
                      <div className="space-y-3 pt-1">
                        <TextField
                          label="Total bill"
                          value={splitTotalText}
                          onChange={(e) => setSplitTotalText(e.target.value)}
                          inputMode="decimal"
                          prefix="₹"
                          className="tnum"
                        />
                        <PersonPicker
                          value={splitPersonIds}
                          onChange={setSplitPersonIds}
                          people={people}
                        />
                        {splitPersonIds.length > 0 &&
                          (() => {
                            const total = parseAmountInput(splitTotalText) ?? 0;
                            const { yourShare, otherShare } = computeSplitShares(
                              total,
                              splitPersonIds.length,
                            );
                            return (
                              <p className="text-[12.5px] text-ink-tertiary">
                                You: {formatMoneyPrecise(yourShare)} · each
                                other person: {formatMoneyPrecise(otherShare)}.
                                Recorded as your spend; the rest is tracked as
                                owed to you under Money → People.
                              </p>
                            );
                          })()}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <p className="text-[13px] font-medium text-ink-secondary">
                    {draft.type === "TRANSFER" ? "From account" : "Paid with"}
                  </p>
                  <AccountPicker
                    accounts={accounts}
                    value={draft.accountId}
                    onChange={(id) => patch({ accountId: id })}
                    allowNone
                  />
                </div>

                {draft.type === "TRANSFER" && (
                  <div className="space-y-1.5">
                    <p className="text-[13px] font-medium text-ink-secondary">
                      To account
                    </p>
                    <AccountPicker
                      accounts={accounts.filter((a) => a.id !== draft.accountId)}
                      value={draft.toAccountId}
                      onChange={(id) => patch({ toAccountId: id })}
                    />
                    <p className="text-[12.5px] text-ink-tertiary">
                      Moving money between accounts is never counted as
                      spending.
                    </p>
                  </div>
                )}

                {draft.type === "INVESTMENT" && investments.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[13px] font-medium text-ink-secondary">
                      Investment
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {investments.map((investment) => (
                        <SelectableChip
                          key={investment.id}
                          selected={investment.id === draft.investmentId}
                          onClick={() => patch({ investmentId: investment.id })}
                        >
                          {investment.name}
                        </SelectableChip>
                      ))}
                    </div>
                  </div>
                )}

                <TextField
                  label="Notes"
                  value={draft.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Correction panels, stacked above the sheet. */}
      <Sheet
        open={panel === "category"}
        onClose={() => setPanel(null)}
        title="Category"
        size="md"
      >
        <CategoryPicker
          value={draft.categoryId}
          onChange={(id) => {
            patch({ categoryId: id });
            markTouched("categoryId");
            setPanel(null);
          }}
        />
      </Sheet>

      <Sheet
        open={panel === "context"}
        onClose={() => setPanel(null)}
        title="Context"
        description="Who you were with and what it involved"
        size="md"
        footer={
          <Button variant="primary" block onClick={() => setPanel(null)}>
            Done
          </Button>
        }
      >
        <ContextPicker
          value={draft.contexts}
          onChange={(contexts) => {
            patch({ contexts });
            markTouched("contexts");
          }}
        />
      </Sheet>
    </Sheet>
  );
}

function summaryLine(
  draft: DraftState,
  pathOf: (id: string | undefined) => string,
): string {
  const parts = [pathOf(draft.categoryId).replace(" › ", " · ")];
  for (const context of draft.contexts) {
    if (context.value === "weekend" || context.value === "late-night") continue;
    parts.push(contextLabel(context.value));
  }
  return parts.join(" · ");
}

/**
 * The interpretation strip — the heart of the trust model.
 *
 * The user should never wonder what the app decided on their behalf. Every
 * inference is on screen before saving, and each one is a button.
 */
function Interpretation({
  draft,
  parsedConfidence,
  reasons,
  categoryPath,
  onEditCategory,
  onEditContexts,
  showCategory,
}: {
  draft: DraftState;
  parsedConfidence: number | null;
  reasons: string[];
  categoryPath: string;
  onEditCategory: () => void;
  onEditContexts: () => void;
  showCategory: boolean;
}) {
  const uncertain = parsedConfidence !== null && parsedConfidence < 0.82;
  const visibleContexts = draft.contexts.filter(
    (c) => c.value !== "weekend" && c.value !== "late-night",
  );
  const derived = draft.contexts.filter(
    (c) => c.value === "weekend" || c.value === "late-night",
  );

  return (
    <motion.div
      layout
      className={cn(
        "rounded-xl border p-3.5",
        uncertain ? "border-line bg-surface-sunken/60" : "border-line bg-surface",
      )}
    >
      <div className="mb-2.5 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-ink-tertiary" strokeWidth={1.75} />
        <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-ink-tertiary">
          {uncertain ? "Best guess — check this" : "Understood as"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {showCategory && (
          <SelectableChip selected onClick={onEditCategory}>
            {categoryPath}
          </SelectableChip>
        )}
        {visibleContexts.map((context) => (
          <SelectableChip key={context.value} onClick={onEditContexts}>
            {contextLabel(context.value)}
          </SelectableChip>
        ))}
        <SelectableChip onClick={onEditContexts}>
          {visibleContexts.length > 0 ? "Edit context" : "Add context"}
        </SelectableChip>
        {derived.map((context) => (
          <Chip key={context.value} tone="neutral">
            {contextLabel(context.value)}
          </Chip>
        ))}
      </div>

      {reasons.length > 0 && (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-tertiary">
          {reasons[0]}
        </p>
      )}
    </motion.div>
  );
}
