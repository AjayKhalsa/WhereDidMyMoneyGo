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
import { usePathname } from "next/navigation";
import {
  createCategoryLookup,
  type CategoryLookup,
} from "@/lib/domain/categories";
import { contextLabel } from "@/lib/domain/contexts";
import { addMonths, monthKey, type MonthKey } from "@/lib/domain/dates";
import type { Database, Paise } from "@/lib/domain/types";
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
import { personBalances, type PersonBalance } from "@/lib/engine/splits";
import {
  monthTotals,
  monthTransactions,
  netWorth,
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
  /** Pins the view to a specific cycle (used by goBack/goForward). */
  setMonth: (month: MonthKey) => void;
  /** Stops tracking a pinned cycle and resumes following the live one. */
  trackCurrentMonth: () => void;
  isCurrentMonth: boolean;
  /** Re-renders every minute so greetings and day counts stay accurate. */
  now: Date;
  /**
   * Day of month the budgeting cycle starts on — from the primary income
   * source's payday, or 1 (plain calendar months) if none is set.
   */
  cycleStartDay: number;

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
  /** Net owed-to-me / I-owe balance per active person. */
  peopleBalances: PersonBalance[];
  /**
   * Cash + invested (at cost) + net owed by people − card debt. Distinct
   * from `safeToSpend.bankBalance` (cash only) and `safeToSpend.safeAmount`
   * (forward-looking) — never conflate the three.
   */
  netWorth: Paise;
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
  // null = tracking the live cycle; a value = pinned to a specific cycle by
  // goBack/goForward. `goToCurrent` clears the pin rather than computing and
  // storing "today's" cycle, so it keeps tracking correctly even if
  // cycleStartDay changes later (e.g. editing payday in Settings while
  // sitting on "current") — a stored, once-computed value couldn't.
  const [pinnedMonth, setPinnedMonth] = useState<MonthKey | null>(null);
  const pathname = usePathname();

  // A first run starts genuinely empty (spec §36). Landing someone in four
  // months of invented spending would mean the first numbers they ever see in
  // a money app are fiction. Sample data is a deliberate choice in Settings.
  //
  // Skipped on /login: there's no session yet, so a Supabase-backed repo has
  // nothing to load and nothing to seed — that's the login form's problem to
  // solve first, not this provider's.
  useEffect(() => {
    if (pathname === "/login") return;
    void initStore(() => createEmptyDatabase());
  }, [pathname]);

  const db = state.data;

  const categories = useMemo(
    () => createCategoryLookup(db?.categories ?? []),
    [db?.categories],
  );

  // The primary income source's payday defines the cycle. "Primary" = the
  // active recurring source created first — array order isn't guaranteed by
  // either backend (Supabase's query has no ORDER BY, IndexedDB's getAll()
  // doesn't promise insertion order), so this sorts explicitly rather than
  // trusting whatever order the rows came back in.
  const cycleStartDay = useMemo(() => {
    const primary = (db?.incomeSources ?? [])
      .filter((s) => s.isActive && s.recurring)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    return primary?.dayOfMonth ?? 1;
  }, [db?.incomeSources]);

  const value = useMemo<FinanceContextValue>(() => {
    const empty: Database["transactions"] = [];
    const transactions = db?.transactions ?? empty;

    const liveMonth = monthKey(now, cycleStartDay);
    const month = pinnedMonth ?? liveMonth;

    const totals = monthTotals(transactions, month, cycleStartDay);
    const monthRows = monthTransactions(transactions, month, cycleStartDay);

    const safeToSpend = calculateSafeToSpend({
      transactions,
      accounts: db?.accounts ?? [],
      incomeSources: db?.incomeSources ?? [],
      investments: db?.investments ?? [],
      recurring: db?.recurring ?? [],
      goals: db?.goals ?? [],
      month,
      now,
      cycleStartDay,
    });

    const insights = generateInsights({
      transactions,
      accounts: db?.accounts ?? [],
      goals: db?.goals ?? [],
      investments: db?.investments ?? [],
      month,
      now,
      cycleStartDay,
      groupLabel: (groupId) => categories.byId.get(groupId)?.name ?? "Other",
    });

    const score = calculateFinancialScore({
      transactions,
      accounts: db?.accounts ?? [],
      goals: db?.goals ?? [],
      month,
      now,
      cycleStartDay,
      consistency: spendingConsistency(transactions, month, now, cycleStartDay),
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
          now,
        ),
      );

    const peopleBalances = personBalances(db?.people ?? [], db?.splits ?? []);
    const netWorthValue = netWorth(
      db?.accounts ?? [],
      transactions,
      db?.investments ?? [],
      peopleBalances,
      now,
    );

    return {
      status: state.status,
      error: state.error,
      db,
      month,
      setMonth: setPinnedMonth,
      trackCurrentMonth: () => setPinnedMonth(null),
      isCurrentMonth: month === liveMonth,
      now,
      cycleStartDay,
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
      peopleBalances,
      netWorth: netWorthValue,
    };
  }, [db, pinnedMonth, now, cycleStartDay, categories, state.status, state.error]);

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
  const { month, setMonth, trackCurrentMonth, cycleStartDay, now } = useFinance();
  const current = monthKey(now, cycleStartDay);

  const shift = useCallback(
    (delta: number) => {
      const next = addMonths(month, delta, cycleStartDay);
      if (next > current) return;
      setMonth(next);
    },
    [month, setMonth, cycleStartDay, current],
  );

  return {
    month,
    canGoForward: month < current,
    goBack: () => shift(-1),
    goForward: () => shift(1),
    goToCurrent: trackCurrentMonth,
  };
}
