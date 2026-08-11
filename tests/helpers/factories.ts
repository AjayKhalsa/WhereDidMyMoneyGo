import type {
  Account,
  ClassificationRule,
  CreditCardDetail,
  Goal,
  IncomeSource,
  Investment,
  Paise,
  Person,
  RecurringTransaction,
  Split,
  Transaction,
} from "@/lib/domain/types";

/**
 * Builders for domain objects under test.
 *
 * The domain interfaces are wide and `noUncheckedIndexedAccess` is on, so
 * inline object literals bury the one field a test actually cares about under
 * a dozen defaults. Every builder takes a `Partial` and fills the rest, so a
 * test reads as "an expense of ₹1,000 on the HDFC card" and nothing else.
 */

let counter = 0;
/** Deterministic within a file, unique across a run. */
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}`;
}

/** Rupees to paise — tests are written in rupees because statements are. */
export function rs(rupees: number): Paise {
  return Math.round(rupees * 100);
}

/**
 * A local wall-clock ISO stamp, matching what the app stores.
 * `at("2026-08-09")` → midnight; `at("2026-08-09", 20, 15)` → 20:15.
 */
export function at(date: string, hour = 12, minute = 0): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}T${pad(hour)}:${pad(minute)}:00`;
}

export function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: nextId("acc"),
    name: "HDFC Bank",
    type: "BANK",
    openingBalance: 0,
    isActive: true,
    createdAt: at("2026-01-01"),
    ...overrides,
  };
}

export function makeCard(overrides: Partial<Account> = {}): Account {
  return makeAccount({ name: "HSBC Travel One", type: "CREDIT_CARD", ...overrides });
}

export function makeCardDetail(
  overrides: Partial<CreditCardDetail> = {},
): CreditCardDetail {
  return {
    id: nextId("ccd"),
    accountId: nextId("acc"),
    statementDay: 25,
    dueDay: 9,
    creditLimit: rs(200_000),
    ...overrides,
  };
}

export function makeTransaction(
  overrides: Partial<Transaction> = {},
): Transaction {
  const createdAt = overrides.date ?? at("2026-08-01");
  return {
    id: nextId("txn"),
    type: "EXPENSE",
    amount: rs(1000),
    description: "Test transaction",
    date: at("2026-08-01"),
    categoryId: "other",
    contexts: [],
    source: "manual",
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

/** Shorthands for the four types, since direction is implied by type. */
export function expense(overrides: Partial<Transaction> = {}): Transaction {
  return makeTransaction({ type: "EXPENSE", ...overrides });
}

export function income(overrides: Partial<Transaction> = {}): Transaction {
  return makeTransaction({
    type: "INCOME",
    description: "Salary",
    categoryId: undefined,
    ...overrides,
  });
}

export function transfer(overrides: Partial<Transaction> = {}): Transaction {
  return makeTransaction({
    type: "TRANSFER",
    description: "Transfer",
    categoryId: undefined,
    ...overrides,
  });
}

export function investmentTxn(
  overrides: Partial<Transaction> = {},
): Transaction {
  return makeTransaction({
    type: "INVESTMENT",
    description: "SIP",
    categoryId: undefined,
    ...overrides,
  });
}

export function makeInvestment(
  overrides: Partial<Investment> = {},
): Investment {
  return {
    id: nextId("inv"),
    name: "Index Fund",
    kind: "MUTUAL_FUND",
    monthlyContribution: 0,
    isActive: true,
    createdAt: at("2026-01-01"),
    ...overrides,
  };
}

export function makeRecurring(
  overrides: Partial<RecurringTransaction> = {},
): RecurringTransaction {
  return {
    id: nextId("rec"),
    description: "Rent",
    amount: rs(30_000),
    frequency: "MONTHLY",
    dayOfPeriod: 1,
    type: "EXPENSE",
    categoryId: "other",
    isActive: true,
    createdAt: at("2026-01-01"),
    ...overrides,
  };
}

export function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: nextId("goal"),
    name: "Emergency fund",
    targetAmount: rs(500_000),
    currentAmount: 0,
    monthlyContribution: 0,
    createdAt: at("2026-01-01"),
    ...overrides,
  };
}

export function makeIncomeSource(
  overrides: Partial<IncomeSource> = {},
): IncomeSource {
  return {
    id: nextId("inc"),
    name: "Salary",
    amount: rs(300_000),
    recurring: true,
    dayOfMonth: 24,
    deductions: 0,
    isActive: true,
    createdAt: at("2026-01-01"),
    ...overrides,
  };
}

export function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: nextId("per"),
    name: "Riya",
    isActive: true,
    createdAt: at("2026-01-01"),
    ...overrides,
  };
}

export function makeSplit(overrides: Partial<Split> = {}): Split {
  const createdAt = at("2026-08-01");
  return {
    id: nextId("spl"),
    transactionId: nextId("txn"),
    personId: nextId("per"),
    direction: "OWED_TO_ME",
    amount: rs(500),
    status: "OUTSTANDING",
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

export function makeRule(
  overrides: Partial<ClassificationRule> = {},
): ClassificationRule {
  const createdAt = at("2026-01-01");
  return {
    id: nextId("rule"),
    pattern: "uber",
    categoryId: "transport.cab",
    contexts: [],
    confidence: 0.9,
    timesApplied: 3,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}
