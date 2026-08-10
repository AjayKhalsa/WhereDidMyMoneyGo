import { buildCategorySeed } from "@/lib/domain/categories";
import { makeContext } from "@/lib/domain/contexts";
import {
  daysInMonth,
  monthKey,
  previousMonths,
  toLocalISO,
  type MonthKey,
} from "@/lib/domain/dates";
import { rupeesToPaise } from "@/lib/domain/money";
import type {
  Account,
  CreditCardDetail,
  Database,
  Goal,
  IncomeSource,
  Investment,
  Paise,
  Person,
  RecurringTransaction,
  Split,
  Transaction,
  TransactionContext,
  UserProfile,
} from "@/lib/domain/types";
import { creditCardOutstanding, liquidBalance } from "@/lib/engine/analytics";

/**
 * Demo data generator (spec §35).
 *
 * A finance app with an empty database is impossible to judge — you cannot
 * tell whether the insight engine is clever or whether the breakdown reads
 * well without real texture behind it. So a fresh install gets four months of
 * plausible history for one person living in an Indian metro.
 *
 * Everything is generated from a fixed seed, so the app looks the same on
 * every machine, and generated relative to *today*, so the current month is
 * always partially complete and the month progress bar tells the truth.
 *
 * Category totals are targets that amounts are scaled to hit; individual
 * transactions are randomised within plausible ranges. That gives headline
 * figures worth reading and line items that don't look synthetic.
 */

/** Deterministic PRNG — same demo data on every device. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function randomInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Splits `target` into `count` positive amounts that sum to it exactly.
 * Weights are randomised so the line items look organic, then normalised and
 * rounded to the nearest ₹10 with the remainder absorbed by the last row.
 */
function distribute(rng: Rng, target: Paise, count: number): Paise[] {
  if (count <= 0) return [];
  if (count === 1) return [target];
  const weights = Array.from({ length: count }, () => 0.55 + rng() * 0.9);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const amounts = weights.map((w) =>
    Math.max(1000, Math.round((target * w) / totalWeight / 1000) * 1000),
  );
  const drift = target - amounts.reduce((a, b) => a + b, 0);
  amounts[amounts.length - 1] = Math.max(1000, amounts[amounts.length - 1]! + drift);
  return amounts;
}

// ---------------------------------------------------------------------------
// Static entities
// ---------------------------------------------------------------------------

const ACCOUNT_IDS = {
  hdfc: "acc_hdfc",
  icici: "acc_icici",
  cash: "acc_cash",
  card: "acc_hdfc_card",
} as const;

const INVESTMENT_IDS = {
  ppf: "inv_ppf",
  mf: "inv_mf",
  fd: "inv_fd",
  stocks: "inv_stocks",
} as const;

function buildAccounts(): Account[] {
  const createdAt = new Date().toISOString();
  return [
    {
      id: ACCOUNT_IDS.hdfc,
      name: "HDFC Bank",
      type: "BANK",
      openingBalance: 0, // back-filled once spending is known
      isActive: true,
      hint: "4821",
      createdAt,
    },
    {
      id: ACCOUNT_IDS.icici,
      name: "ICICI Bank",
      type: "BANK",
      openingBalance: rupeesToPaise(42_000),
      isActive: true,
      hint: "9037",
      createdAt,
    },
    {
      id: ACCOUNT_IDS.cash,
      name: "Cash",
      type: "CASH",
      openingBalance: rupeesToPaise(3_500),
      isActive: true,
      createdAt,
    },
    {
      id: ACCOUNT_IDS.card,
      name: "HDFC Credit Card",
      type: "CREDIT_CARD",
      openingBalance: 0,
      isActive: true,
      hint: "6602",
      createdAt,
    },
  ];
}

function buildCreditCards(): CreditCardDetail[] {
  return [
    {
      id: "cc_hdfc",
      accountId: ACCOUNT_IDS.card,
      statementDay: 20,
      dueDay: 15,
      creditLimit: rupeesToPaise(250_000),
    },
  ];
}

function buildInvestments(): Investment[] {
  const createdAt = new Date().toISOString();
  return [
    {
      id: INVESTMENT_IDS.mf,
      name: "Mutual Funds",
      kind: "MUTUAL_FUND",
      monthlyContribution: rupeesToPaise(30_000),
      isActive: true,
      createdAt,
    },
    {
      id: INVESTMENT_IDS.ppf,
      name: "PPF",
      kind: "PPF",
      monthlyContribution: rupeesToPaise(12_500),
      isActive: true,
      createdAt,
    },
    {
      id: INVESTMENT_IDS.fd,
      name: "Fixed Deposit",
      kind: "FD",
      monthlyContribution: rupeesToPaise(10_000),
      isActive: true,
      createdAt,
    },
    {
      id: INVESTMENT_IDS.stocks,
      name: "Stocks",
      kind: "STOCKS",
      monthlyContribution: rupeesToPaise(5_000),
      isActive: true,
      createdAt,
    },
  ];
}

function buildIncomeSources(): IncomeSource[] {
  return [
    {
      id: "inc_salary",
      name: "Salary",
      amount: rupeesToPaise(155_000),
      recurring: true,
      dayOfMonth: 1,
      deductions: rupeesToPaise(2_340),
      accountId: ACCOUNT_IDS.hdfc,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
  ];
}

function buildGoals(): Goal[] {
  const createdAt = new Date().toISOString();
  return [
    {
      id: "goal_emergency",
      name: "Emergency Fund",
      targetAmount: rupeesToPaise(200_000),
      currentAmount: rupeesToPaise(160_000),
      monthlyContribution: 0,
      targetDate: undefined,
      createdAt,
    },
    {
      id: "goal_macbook",
      name: "MacBook Pro",
      targetAmount: rupeesToPaise(150_000),
      currentAmount: rupeesToPaise(60_000),
      monthlyContribution: rupeesToPaise(8_000),
      createdAt,
    },
    {
      id: "goal_vacation",
      name: "Japan trip",
      targetAmount: rupeesToPaise(80_000),
      currentAmount: rupeesToPaise(48_000),
      monthlyContribution: 0,
      createdAt,
    },
  ];
}

interface RecurringSeed extends RecurringTransaction {
  merchantLabel: string;
}

function buildRecurring(): RecurringSeed[] {
  const createdAt = new Date().toISOString();
  const base = { isActive: true, createdAt, frequency: "MONTHLY" as const };
  return [
    {
      ...base,
      id: "rec_gym",
      description: "Gym membership",
      merchant: "Cult.fit",
      merchantLabel: "Cult.fit",
      amount: rupeesToPaise(2_000),
      dayOfPeriod: 3,
      categoryId: "health",
      accountId: ACCOUNT_IDS.hdfc,
      type: "EXPENSE",
    },
    {
      ...base,
      id: "rec_internet",
      description: "Internet",
      merchant: "ACT Fibernet",
      merchantLabel: "ACT Fibernet",
      amount: rupeesToPaise(999),
      dayOfPeriod: 5,
      categoryId: "bills",
      accountId: ACCOUNT_IDS.hdfc,
      type: "EXPENSE",
    },
    {
      ...base,
      id: "rec_electricity",
      description: "Electricity bill",
      merchant: "BESCOM",
      merchantLabel: "BESCOM",
      amount: rupeesToPaise(2_181),
      dayOfPeriod: 7,
      categoryId: "bills",
      accountId: ACCOUNT_IDS.hdfc,
      type: "EXPENSE",
    },
    {
      ...base,
      id: "rec_netflix",
      description: "Netflix",
      merchant: "Netflix",
      merchantLabel: "Netflix",
      amount: rupeesToPaise(649),
      dayOfPeriod: 12,
      categoryId: "bills",
      accountId: ACCOUNT_IDS.card,
      type: "EXPENSE",
    },
    {
      ...base,
      id: "rec_spotify",
      description: "Spotify",
      merchant: "Spotify",
      merchantLabel: "Spotify",
      amount: rupeesToPaise(119),
      dayOfPeriod: 18,
      categoryId: "bills",
      accountId: ACCOUNT_IDS.card,
      type: "EXPENSE",
    },
    {
      ...base,
      id: "rec_mobile",
      description: "Mobile recharge",
      merchant: "Jio",
      merchantLabel: "Jio",
      amount: rupeesToPaise(399),
      dayOfPeriod: 22,
      categoryId: "bills",
      accountId: ACCOUNT_IDS.hdfc,
      type: "EXPENSE",
    },
  ];
}

// ---------------------------------------------------------------------------
// Expense templates
// ---------------------------------------------------------------------------

interface Template {
  description: string;
  categoryId: string;
  merchant?: string;
  contexts?: string[];
  /** Preferred hour range. */
  hours: [number, number];
  account: keyof typeof ACCOUNT_IDS;
}

interface Bucket {
  id: string;
  templates: Template[];
  /**
   * Typical rupee value of one transaction in this bucket.
   *
   * Transaction count is derived from `target / typicalAmount` rather than
   * fixed per month, which keeps individual line items believable whatever
   * the target is — ₹12,400 of dining becomes fourteen ~₹900 meals, not
   * three implausible ₹4,100 ones.
   */
  typicalAmount: number;
  /** Bias toward Saturday/Sunday. */
  weekendBias?: boolean;
}

const BUCKETS: Bucket[] = [
  {
    id: "dining",
    typicalAmount: 900,
    templates: [
      { description: "Dinner at Toit", categoryId: "dining.dinner", merchant: "Toit", hours: [19, 22], account: "card" },
      { description: "Lunch", categoryId: "dining.lunch", hours: [12, 15], account: "card" },
      { description: "Swiggy order", categoryId: "dining", merchant: "Swiggy", hours: [13, 22], account: "card" },
      { description: "Zomato order", categoryId: "dining", merchant: "Zomato", hours: [13, 22], account: "card" },
      { description: "Coffee", categoryId: "dining.coffee", merchant: "Blue Tokai", hours: [8, 18], account: "hdfc" },
      { description: "Breakfast", categoryId: "dining.breakfast", hours: [8, 11], account: "hdfc" },
      { description: "Biryani", categoryId: "dining", hours: [13, 21], account: "cash" },
    ],
  },
  {
    id: "dating",
    typicalAmount: 1600,
    weekendBias: true,
    templates: [
      { description: "Dinner", categoryId: "dining.dinner", contexts: ["dating"], hours: [19, 22], account: "card" },
      { description: "Drinks", categoryId: "dining.drinks", contexts: ["dating", "alcohol"], hours: [20, 23], account: "card" },
      { description: "Movie", categoryId: "entertainment.movie", merchant: "PVR", contexts: ["dating"], hours: [17, 22], account: "card" },
      { description: "Coffee date", categoryId: "dining.coffee", contexts: ["dating"], hours: [16, 19], account: "hdfc" },
      { description: "Gift", categoryId: "gifts", contexts: ["dating", "gift"], hours: [12, 20], account: "card" },
    ],
  },
  {
    id: "transport",
    typicalAmount: 340,
    templates: [
      { description: "Uber to office", categoryId: "transport.cab", merchant: "Uber", contexts: ["work"], hours: [8, 11], account: "hdfc" },
      { description: "Uber home", categoryId: "transport.cab", merchant: "Uber", hours: [18, 23], account: "hdfc" },
      { description: "Ola ride", categoryId: "transport.cab", merchant: "Ola", hours: [9, 22], account: "hdfc" },
      { description: "Rapido", categoryId: "transport.cab", merchant: "Rapido", hours: [8, 20], account: "hdfc" },
      { description: "Metro", categoryId: "transport.metro", hours: [8, 21], account: "cash" },
    ],
  },
  {
    id: "diet",
    typicalAmount: 900,
    templates: [
      { description: "Whey protein", categoryId: "essentials", merchant: "MuscleBlaze", hours: [10, 20], account: "card" },
      { description: "Eggs and oats", categoryId: "essentials", merchant: "Zepto", hours: [8, 20], account: "hdfc" },
      { description: "Creatine", categoryId: "essentials", hours: [10, 20], account: "card" },
      { description: "Meal prep groceries", categoryId: "essentials", merchant: "BigBasket", hours: [9, 19], account: "hdfc" },
    ],
  },
  {
    id: "shopping",
    typicalAmount: 1400,
    templates: [
      { description: "T-shirts", categoryId: "shopping.clothing", merchant: "Myntra", hours: [11, 22], account: "card" },
      { description: "Sneakers", categoryId: "shopping.clothing", merchant: "Decathlon", hours: [12, 20], account: "card" },
      { description: "Amazon order", categoryId: "shopping", merchant: "Amazon", hours: [10, 23], account: "card" },
      { description: "Headphones", categoryId: "shopping.electronics", merchant: "Amazon", hours: [10, 22], account: "card" },
    ],
  },
  {
    id: "social",
    typicalAmount: 1600,
    weekendBias: true,
    templates: [
      { description: "Dinner with friends", categoryId: "dining.dinner", contexts: ["friends"], hours: [19, 23], account: "card" },
      { description: "Drinks with the gang", categoryId: "dining.drinks", contexts: ["friends", "alcohol"], hours: [20, 23], account: "card" },
      { description: "House party contribution", categoryId: "entertainment.event", contexts: ["friends", "alcohol"], hours: [18, 23], account: "hdfc" },
      { description: "Brunch with friends", categoryId: "dining.breakfast", contexts: ["friends"], hours: [11, 15], account: "card" },
    ],
  },
  {
    id: "entertainment",
    typicalAmount: 900,
    weekendBias: true,
    templates: [
      { description: "Movie tickets", categoryId: "entertainment.movie", merchant: "BookMyShow", hours: [16, 22], account: "card" },
      { description: "Comedy show", categoryId: "entertainment.event", merchant: "BookMyShow", hours: [19, 22], account: "card" },
      { description: "Steam game", categoryId: "entertainment.games", merchant: "Steam", hours: [20, 23], account: "card" },
    ],
  },
  {
    id: "essentials",
    typicalAmount: 1400,
    templates: [
      { description: "Groceries", categoryId: "essentials", merchant: "Blinkit", hours: [9, 21], account: "hdfc" },
      { description: "Toiletries", categoryId: "essentials", merchant: "Zepto", hours: [10, 21], account: "hdfc" },
      { description: "Sunscreen", categoryId: "essentials", hours: [11, 20], account: "hdfc" },
      { description: "Medicines", categoryId: "essentials", merchant: "PharmEasy", hours: [9, 20], account: "hdfc" },
    ],
  },
];

/** Rupee targets per bucket. Index 0 is the current month. */
const TARGETS: Record<string, number[]> = {
  //         now      -1      -2      -3
  dining: [12_400, 9_400, 10_200, 9_800],
  dating: [8_600, 4_600, 5_200, 4_900],
  transport: [6_200, 5_800, 6_400, 5_600],
  diet: [5_400, 5_200, 4_800, 5_400],
  shopping: [4_800, 6_200, 3_800, 7_400],
  social: [4_200, 3_800, 4_600, 3_400],
  entertainment: [2_400, 2_800, 1_900, 2_600],
  essentials: [1_000, 5_200, 4_900, 5_600],
};

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function contextsFor(
  template: Template,
  when: Date,
): TransactionContext[] {
  const values = [...(template.contexts ?? [])];
  const day = when.getDay();
  if (day === 0 || day === 6) values.push("weekend");
  const hour = when.getHours();
  if (hour >= 22 || hour < 4) values.push("late-night");
  return [...new Set(values)].map((value) => makeContext(value));
}

function pickDay(rng: Rng, maxDay: number, weekendBias: boolean, month: MonthKey): number {
  if (!weekendBias) return randomInt(rng, 1, maxDay);
  // Three attempts to land on a weekend, then give up and take what we get.
  const [year, monthNumber] = month.split("-").map(Number);
  for (let attempt = 0; attempt < 3; attempt++) {
    const day = randomInt(rng, 1, maxDay);
    const dow = new Date(year ?? 1970, (monthNumber ?? 1) - 1, day).getDay();
    if (dow === 0 || dow === 6) return day;
  }
  return randomInt(rng, 1, maxDay);
}

function generateBucket(
  rng: Rng,
  bucket: Bucket,
  month: MonthKey,
  targetRupees: number,
  maxDay: number,
  seq: () => string,
): Transaction[] {
  const target = rupeesToPaise(targetRupees);
  if (target <= 0) return [];

  // Count follows from how big a typical purchase in this bucket is, with a
  // little jitter so months don't look mechanically identical.
  const typical = rupeesToPaise(bucket.typicalAmount);
  const jitter = 0.85 + rng() * 0.3;
  const count = Math.max(1, Math.min(40, Math.round((target / typical) * jitter)));

  const amounts = distribute(rng, target, count);
  const [year, monthNumber] = month.split("-").map(Number);

  return amounts.map((amount) => {
    const template = pick(rng, bucket.templates);
    const day = pickDay(rng, maxDay, bucket.weekendBias ?? false, month);
    const hour = randomInt(rng, template.hours[0], template.hours[1]);
    const minute = randomInt(rng, 0, 11) * 5;
    const when = new Date(year ?? 1970, (monthNumber ?? 1) - 1, day, hour, minute);
    const iso = toLocalISO(when);

    return {
      id: seq(),
      type: "EXPENSE",
      amount,
      description: template.description,
      date: iso,
      merchant: template.merchant,
      accountId: ACCOUNT_IDS[template.account],
      categoryId: template.categoryId,
      contexts: contextsFor(template, when),
      source: "seed",
      createdAt: iso,
      updatedAt: iso,
    } satisfies Transaction;
  });
}

export function createSeedDatabase(now = new Date()): Database {
  const rng = mulberry32(20260809);
  let counter = 0;
  const seq = () => `seed_${(++counter).toString(36).padStart(4, "0")}`;

  const accounts = buildAccounts();
  const creditCards = buildCreditCards();
  const investments = buildInvestments();
  const incomeSources = buildIncomeSources();
  const goals = buildGoals();
  const recurringSeeds = buildRecurring();
  const recurring: RecurringTransaction[] = recurringSeeds.map(
    ({ merchantLabel: _label, ...rule }) => rule,
  );

  const currentMonth = monthKey(now);
  // Generated oldest â†’ newest so that running balances and card payments can
  // be computed from what already exists rather than guessed at.
  const chronological: MonthKey[] = [
    ...previousMonths(currentMonth, 3),
    currentMonth,
  ];
  const transactions: Transaction[] = [];

  chronological.forEach((month, index) => {
    // TARGETS is indexed by recency: 0 is this month, 3 is three months ago.
    const monthIndex = chronological.length - 1 - index;
    const isCurrent = month === currentMonth;
    const lastDay = daysInMonth(month);
    const maxDay = isCurrent ? Math.min(now.getDate(), lastDay) : lastDay;
    const [year, monthNumber] = month.split("-").map(Number);
    const makeDate = (day: number, hour: number, minute = 0) =>
      toLocalISO(
        new Date(year ?? 1970, (monthNumber ?? 1) - 1, Math.min(day, lastDay), hour, minute),
      );

    // --- Salary ---------------------------------------------------------
    const salary = incomeSources[0]!;
    if (salary.dayOfMonth <= maxDay) {
      const iso = makeDate(salary.dayOfMonth, 10);
      transactions.push({
        id: seq(),
        type: "INCOME",
        amount: salary.amount - salary.deductions,
        description: "Salary",
        date: iso,
        merchant: "Employer",
        accountId: ACCOUNT_IDS.hdfc,
        contexts: [],
        source: "seed",
        createdAt: iso,
        updatedAt: iso,
      });
    }

    // --- Investment contributions ---------------------------------------
    for (const investment of investments) {
      const day = 2;
      if (day > maxDay) continue;
      const iso = makeDate(day, 11);
      transactions.push({
        id: seq(),
        type: "INVESTMENT",
        amount: investment.monthlyContribution,
        description: investment.name,
        date: iso,
        accountId: ACCOUNT_IDS.hdfc,
        investmentId: investment.id,
        contexts: [],
        source: "seed",
        createdAt: iso,
        updatedAt: iso,
      });
    }

    // --- Recurring bills -------------------------------------------------
    for (const rule of recurringSeeds) {
      if (rule.dayOfPeriod > maxDay) continue;
      const iso = makeDate(rule.dayOfPeriod, 9);
      transactions.push({
        id: seq(),
        type: "EXPENSE",
        amount: rule.amount,
        description: rule.description,
        date: iso,
        merchant: rule.merchantLabel,
        accountId: rule.accountId,
        categoryId: rule.categoryId,
        contexts: [],
        recurringId: rule.id,
        source: "recurring",
        createdAt: iso,
        updatedAt: iso,
      });
    }

    // --- Discretionary spending -----------------------------------------
    for (const bucket of BUCKETS) {
      const target = TARGETS[bucket.id]?.[monthIndex] ?? 0;
      transactions.push(
        ...generateBucket(rng, bucket, month, target, maxDay, seq),
      );
    }

    // --- Card payment for the previous month's statement -----------------
    // Paying the card is a TRANSFER, settled on the 3rd of the following
    // month. It must never register as spending — the purchases behind it
    // were already recorded when they happened (spec §17).
    const PAYMENT_DAY = 3;
    if (index > 0 && PAYMENT_DAY <= maxDay) {
      // Everything owed before this month's own charges started landing.
      const priorCharges = transactions.filter(
        (t) => monthKey(t.date) !== month,
      );
      const owed = creditCardOutstanding(priorCharges, ACCOUNT_IDS.card);
      // Real people leave a little riding on the card rather than clearing
      // it to the rupee; that residue is what makes "carried debt" visible.
      const residue = rupeesToPaise(randomInt(rng, 1_500, 4_000));
      const payment = Math.max(0, owed - residue);
      if (payment > 0) {
        const iso = makeDate(PAYMENT_DAY, 12);
        transactions.push({
          id: seq(),
          type: "TRANSFER",
          amount: payment,
          description: "Credit card payment",
          date: iso,
          accountId: ACCOUNT_IDS.hdfc,
          toAccountId: ACCOUNT_IDS.card,
          contexts: [],
          source: "seed",
          createdAt: iso,
          updatedAt: iso,
        });
      }
    }
  });

  // --- Split-expense demo data ---------------------------------------------
  // Two worked examples of the invariant: the recorded EXPENSE is always the
  // user's real share, never the amount fronted — see `recordSplits` in
  // `data/actions.ts`. One outstanding (a recent brunch), one already
  // settled (last month's movie), so both states are visible on first look.
  const people: Person[] = [
    { id: "person_rohan", name: "Rohan", isActive: true, createdAt: new Date().toISOString() },
    { id: "person_priya", name: "Priya", isActive: true, createdAt: new Date().toISOString() },
  ];

  const brunchDay = Math.max(1, Math.min(now.getDate() - 2, daysInMonth(currentMonth)));
  const brunchIso = toLocalISO(
    new Date(now.getFullYear(), now.getMonth(), brunchDay, 12, 30),
  );
  const splitBrunch: Transaction = {
    id: "seed_split_brunch",
    type: "EXPENSE",
    amount: rupeesToPaise(707),
    description: "Brunch with Rohan",
    date: brunchIso,
    accountId: ACCOUNT_IDS.hdfc,
    categoryId: "dining",
    contexts: [makeContext("friends")],
    source: "seed",
    createdAt: brunchIso,
    updatedAt: brunchIso,
  };

  const [prevYear, prevMonthNum] = previousMonths(currentMonth, 1)[0]!
    .split("-")
    .map(Number);
  const movieIso = toLocalISO(
    new Date(prevYear ?? 1970, (prevMonthNum ?? 1) - 1, 14, 19, 0),
  );
  const splitMovie: Transaction = {
    id: "seed_split_movie",
    type: "EXPENSE",
    amount: rupeesToPaise(325),
    description: "Movie with Priya",
    date: movieIso,
    merchant: "PVR",
    accountId: ACCOUNT_IDS.card,
    categoryId: "entertainment",
    contexts: [],
    source: "seed",
    createdAt: movieIso,
    updatedAt: movieIso,
  };

  transactions.push(splitBrunch, splitMovie);

  const splits: Split[] = [
    {
      id: "seed_split_1",
      transactionId: splitBrunch.id,
      personId: "person_rohan",
      direction: "OWED_TO_ME",
      amount: rupeesToPaise(706),
      status: "OUTSTANDING",
      createdAt: brunchIso,
      updatedAt: brunchIso,
    },
    {
      id: "seed_split_2",
      transactionId: splitMovie.id,
      personId: "person_priya",
      direction: "OWED_TO_ME",
      amount: rupeesToPaise(325),
      status: "SETTLED",
      settledDate: toLocalISO(new Date(prevYear ?? 1970, (prevMonthNum ?? 1) - 1, 20)),
      createdAt: movieIso,
      updatedAt: movieIso,
    },
  ];

  transactions.sort((a, b) => a.date.localeCompare(b.date));

  // Back-fill the main account's opening balance so the live balance lands
  // somewhere believable rather than deeply negative.
  const hdfc = accounts.find((a) => a.id === ACCOUNT_IDS.hdfc)!;
  const balanceWithoutOpening = liquidBalance(accounts, transactions);
  hdfc.openingBalance = Math.max(
    0,
    rupeesToPaise(85_000) - balanceWithoutOpening,
  );

  const profile: UserProfile = {
    id: "user_demo",
    name: "there",
    currency: "INR",
    locale: "en-IN",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Asia/Kolkata",
    createdAt: new Date().toISOString(),
    isDemo: true,
    onboarded: true,
  };

  return {
    profile,
    accounts,
    creditCards,
    categories: buildCategorySeed(),
    transactions,
    recurring,
    goals,
    investments,
    incomeSources,
    rules: [],
    people,
    splits,
  };
}

/** A genuinely empty account — used by "start fresh" in settings. */
export function createEmptyDatabase(name = "there"): Database {
  return {
    profile: {
      id: "user_local",
      name,
      currency: "INR",
      locale: "en-IN",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Asia/Kolkata",
      createdAt: new Date().toISOString(),
      isDemo: false,
      onboarded: false,
    },
    accounts: [
      {
        id: "acc_primary",
        name: "Bank account",
        type: "BANK",
        openingBalance: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "acc_cash",
        name: "Cash",
        type: "CASH",
        openingBalance: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ],
    creditCards: [],
    categories: buildCategorySeed(),
    transactions: [],
    recurring: [],
    goals: [],
    investments: [],
    incomeSources: [],
    rules: [],
    people: [],
    splits: [],
  };
}
