/**
 * Core domain model.
 *
 * The single most important rule in this application:
 *
 *     EXPENSE ≠ TRANSFER ≠ INVESTMENT ≠ INCOME
 *
 * Only `EXPENSE` is money consumed. Moving money to a mutual fund is an
 * INVESTMENT, paying off a credit card is a TRANSFER. Neither is spending,
 * and the analytics engine must never treat them as such.
 */

export type TransactionType = "EXPENSE" | "INCOME" | "TRANSFER" | "INVESTMENT";

export type AccountType = "BANK" | "CASH" | "CREDIT_CARD" | "INVESTMENT";

/** Money is stored in paise (minor units) to keep arithmetic exact. */
export type Paise = number;

export interface UserProfile {
  id: string;
  name: string;
  currency: string;
  locale: string;
  timezone: string;
  createdAt: string;
  /** True while the account is populated with generated sample data. */
  isDemo: boolean;
  onboarded: boolean;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /**
   * For BANK/CASH: money available.
   * For CREDIT_CARD: this is NOT used as the balance — outstanding is derived
   * from transactions. See `creditCardOutstanding` in the analytics engine.
   */
  openingBalance: Paise;
  isActive: boolean;
  /** Last 4 digits or similar, purely cosmetic. */
  hint?: string;
  createdAt: string;
}

export interface CreditCardDetail {
  id: string;
  accountId: string;
  /** Day of month the statement is generated. */
  statementDay: number;
  /** Day of month payment is due. */
  dueDay: number;
  creditLimit: Paise;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  /** Ordering hint for pickers and breakdowns. */
  order: number;
  /** Built-in categories cannot be deleted, only hidden. */
  system: boolean;
}

/**
 * A context is a *second dimension* on a transaction.
 *
 * A ₹3,200 dinner can be Dining (category) AND Friends AND Alcohol
 * (contexts) simultaneously. This lets "how much did I spend on dates?"
 * and "how much did I spend eating out?" both be answered from the same
 * single transaction, without ever double-counting it.
 */
export type ContextType =
  | "PEOPLE" // who you were with: dating, friends, family, work, solo
  | "OCCASION" // why: weekend, birthday, vacation, celebration
  | "ATTRIBUTE"; // what was distinctive about it: alcohol, gift, shared

export interface TransactionContext {
  type: ContextType;
  /** Stable lowercase key, e.g. "dating", "friends", "alcohol". */
  value: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  /** Always a positive magnitude. Direction is implied by `type`. */
  amount: Paise;
  description: string;
  /** ISO date-time in local wall-clock, e.g. "2026-08-09T20:15:00". */
  date: string;
  merchant?: string;

  /** Source of funds. For INCOME, the destination. */
  accountId?: string;
  /** Destination account. Only meaningful for TRANSFER and INVESTMENT. */
  toAccountId?: string;

  /** Leaf category id. Required for EXPENSE, unused for TRANSFER. */
  categoryId?: string;
  contexts: TransactionContext[];

  /** For INVESTMENT: which investment vehicle this contributes to. */
  investmentId?: string;

  notes?: string;
  /** Set when this row was materialised from a recurring rule. */
  recurringId?: string;
  /** How the transaction was created — used to grade parser accuracy. */
  source: "manual" | "parsed" | "recurring" | "seed" | "imported";
  createdAt: string;
  updatedAt: string;
}

export type RecurringFrequency = "MONTHLY" | "WEEKLY" | "YEARLY";

export interface RecurringTransaction {
  id: string;
  description: string;
  amount: Paise;
  frequency: RecurringFrequency;
  /** Day of month (MONTHLY/YEARLY) or day of week 0-6 (WEEKLY). */
  dayOfPeriod: number;
  categoryId?: string;
  accountId?: string;
  type: Extract<TransactionType, "EXPENSE" | "INVESTMENT">;
  merchant?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: Paise;
  currentAmount: Paise;
  targetDate?: string;
  /** Amount earmarked out of each month's income. Reduces safe-to-spend. */
  monthlyContribution: Paise;
  createdAt: string;
}

export type InvestmentKind =
  | "PPF"
  | "MUTUAL_FUND"
  | "FD"
  | "STOCKS"
  | "NPS"
  | "GOLD"
  | "OTHER";

export interface Investment {
  id: string;
  name: string;
  kind: InvestmentKind;
  /** Planned monthly contribution. Actuals come from transactions. */
  monthlyContribution: Paise;
  isActive: boolean;
  createdAt: string;
  /**
   * V2 hook: current market value for portfolio tracking. Deliberately
   * unused in V1 — contribution tracking only.
   */
  currentValue?: Paise;
}

export interface IncomeSource {
  id: string;
  name: string;
  amount: Paise;
  /** Recurring salary vs one-off bonus/freelance/refund. */
  recurring: boolean;
  /** Day of month salary lands. */
  dayOfMonth: number;
  /** Pre-tax deductions, shown separately from gross. */
  deductions: Paise;
  accountId?: string;
  isActive: boolean;
  createdAt: string;
}

/** Someone you sometimes split an expense with. */
export interface Person {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export type SplitStatus = "OUTSTANDING" | "SETTLED";

/**
 * The unsettled half of a shared expense.
 *
 * The transaction itself always records only *your* real share — see
 * `recordSplits` in `data/actions.ts`. A Split is the side-ledger for the
 * rest: money you fronted that isn't really spending, or money someone
 * covered for you. Settling one is never a transaction of its own — no
 * money is "earned" or "spent" when an IOU clears, it just stops being owed.
 */
export interface Split {
  id: string;
  /** The expense transaction this split was carved out of. */
  transactionId: string;
  personId: string;
  /** OWED_TO_ME: they owe you. I_OWE: you owe them (e.g. they covered you). */
  direction: "OWED_TO_ME" | "I_OWE";
  amount: Paise;
  status: SplitStatus;
  settledDate?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A rule learned from the user's own corrections.
 *
 * When someone re-categorises "Uber" three times, we stop asking.
 * Rules always outrank the built-in lexicon.
 */
export interface ClassificationRule {
  id: string;
  /** Lowercase token or phrase matched against the description. */
  pattern: string;
  categoryId: string;
  contexts: TransactionContext[];
  accountId?: string;
  merchant?: string;
  /** 0-1. Grows each time the user confirms, shrinks when corrected. */
  confidence: number;
  /** How many times this rule has been applied and left uncorrected. */
  timesApplied: number;
  createdAt: string;
  updatedAt: string;
}

/** Everything the app owns, as one serialisable snapshot. */
export interface Database {
  profile: UserProfile;
  accounts: Account[];
  creditCards: CreditCardDetail[];
  categories: Category[];
  transactions: Transaction[];
  recurring: RecurringTransaction[];
  goals: Goal[];
  investments: Investment[];
  incomeSources: IncomeSource[];
  rules: ClassificationRule[];
  people: Person[];
  splits: Split[];
}
