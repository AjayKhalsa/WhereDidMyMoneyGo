"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createCategoryLookup,
  type CategoryLookup,
} from "@/lib/domain/categories";
import { contextLabel } from "@/lib/domain/contexts";
import { monthKey, type MonthKey } from "@/lib/domain/dates";
import type { Database } from "@/lib/domain/types";
import {
  calculateFinancialScore,
  generateInsights,
  headlineInsight,
  type FinancialScore,
  type Insight,
} from "@/lib/engine/insights";
import {
  calculateSafeToSpend,
  type SafeToSpendResult,
} from "@/lib/engine/safe-to-spend";
import {
  monthTotals,
  monthTransactions,
  spendByGroup,
  spendingConsistency,
  spendByContext,
  summariseCreditCard,
  type BreakdownSlice,
  type CreditCardSummary,
  type MonthTotals,
} from "@/lib/engine/analytics";
import { createEmptyDatabase } from "@/lib/data/seed";
import {
  getServerSnapshot,
  getSnapshot,
  initStore,
  subscribe,
  type StoreState,
} from "@/lib/data/store";

/**
 * The single bridge between the engines and React.
 *
 * Everything expensive is memoised on `(database, month)`. Because the store
 * hands back a new database object on every write, one added expense
 * invalidates exactly the derived values that depend on it — safe-to-spend,
 * the breakdown, the insights and the score all recompute together, so no
 * two parts of the screen can ever disagree.
 */

export interface FinanceContextValue {
  status: StoreState["status"];
  error: string | null;
  db: Database | null;

  month: MonthKey;
  setMonth: (month: MonthKey) => void;
  isCurrentMonth: boolean;
  /** Re-renders every minute so greetings and day counts stay accurate. */
  now: Date;

  categories: CategoryLookup;
  totals: MonthTotals;
  safeToSpend: SafeToSpendResult;
  insights: Insight[];
  headline: Insight | undefined;
  score: FinancialScore;
  groupBreakdown: BreakdownSlice[];
  contextBreakdown: BreakdownSlice[];
  creditCards: CreditCardSummary[];
  /** Expenses, income, transfers and investments for the selected month. */
  monthRows: Database["transactions"];
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

function useStoreState(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Ticks once a minute — cheap, and keeps "Good afternoon" from going stale. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const state = useStoreState();
  const now = useNow();
  const [month, setMonth] = useState<MonthKey>(() => monthKey(new Date()));

  // A first run starts genuinely empty (spec §36). Landing someone in four
  // months of invented spending would mean the first numbers they ever see in
  // a money app are fiction. Sample data is a deliberate choice in Settings.
  useEffect(() => {
    void initStore(() => createEmptyDatabase());
  }, []);

  const db = state.data;

  const categories = useMemo(
    () => createCategoryLookup(db?.categories ?? []),
    [db?.categories],
  );

  const value = useMemo<FinanceContextValue>(() => {
    const empty: Database["transactions"] = [];
    const transactions = db?.transactions ?? empty;

    const totals = monthTotals(transactions, month);
    const monthRows = monthTransactions(transactions, month);

    const safeToSpend = calculateSafeToSpend({
      transactions,
      accounts: db?.accounts ?? [],
      incomeSources: db?.incomeSources ?? [],
      investments: db?.investments ?? [],
      recurring: db?.recurring ?? [],
      goals: db?.goals ?? [],
      month,
      now,
    });

    const insights = generateInsights({
      transactions,
      accounts: db?.accounts ?? [],
      goals: db?.goals ?? [],
      investments: db?.investments ?? [],
      month,
      now,
      groupLabel: (groupId) => categories.byId.get(groupId)?.name ?? "Other",
    });

    const score = calculateFinancialScore({
      transactions,
      accounts: db?.accounts ?? [],
      goals: db?.goals ?? [],
      month,
      now,
      consistency: spendingConsistency(transactions, month, now),
    });

    const groupBreakdown = spendByGroup(
      monthRows,
      (groupId) => categories.byId.get(groupId)?.name ?? "Other",
    );

    const contextBreakdown = spendByContext(monthRows, contextLabel);

    const creditCards = (db?.accounts ?? [])
      .filter((a) => a.type === "CREDIT_CARD" && a.isActive)
      .map((account) =>
        summariseCreditCard(
          account,
          db?.creditCards.find((c) => c.accountId === account.id),
          transactions,
          month,
          now,
        ),
      );

    return {
      status: state.status,
      error: state.error,
      db,
      month,
      setMonth,
      isCurrentMonth: month === monthKey(now),
      now,
      categories,
      totals,
      safeToSpend,
      insights,
      headline: headlineInsight(insights),
      score,
      groupBreakdown,
      contextBreakdown,
      creditCards,
      monthRows,
    };
  }, [db, month, now, categories, state.status, state.error]);

  return (
    <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
  );
}

export function useFinance(): FinanceContextValue {
  const value = useContext(FinanceContext);
  if (!value) {
    throw new Error("useFinance must be used inside <FinanceProvider>");
  }
  return value;
}

/** Convenience for screens that only need the raw dataset. */
export function useDatabase(): Database | null {
  return useFinance().db;
}

/** Steps the selected month backward/forward, clamped to the present. */
export function useMonthNavigation() {
  const { month, setMonth, now } = useFinance();
  const current = monthKey(now);

  const shift = useCallback(
    (delta: number) => {
      const [year, monthNumber] = month.split("-").map(Number);
      const date = new Date(year ?? 1970, (monthNumber ?? 1) - 1 + delta, 1);
      const next = monthKey(date);
      if (next > current) return;
      setMonth(next);
    },
    [month, setMonth, current],
  );

  return {
    month,
    canGoForward: month < current,
    goBack: () => shift(-1),
    goForward: () => shift(1),
    goToCurrent: () => setMonth(current),
  };
}
