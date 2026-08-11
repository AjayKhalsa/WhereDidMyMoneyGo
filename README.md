# Where did my money go?

A personal money app built around one idea: **every number should be one you can check.**

Most budgeting apps show a figure and ask you to trust it. This one shows the figure *and its derivation*, so when it says you have ₹6,930 to spend you can follow the arithmetic back to your actual bank balance.

This guide explains what each number means and how to use the app without being misled by it. It also covers running the code — see [Running it](#running-it) at the bottom.

---

## The three headline numbers

They answer three different questions. Blending them is the single easiest way to make a bad decision, so the app keeps them apart.

### Safe to spend — "what can I spend right now?"

Cash you hold, minus what's already promised:

```
  Cash in bank and wallets
− Everything owed on credit cards
+ Salary due this cycle that hasn't landed yet
− Bills still to come this cycle
− Planned investments not yet made
− Money set aside for goals
= Safe to spend
```

**Card debt is subtracted in full**, no matter when it was charged. That money has to come out of the same bank balance whenever the bill arrives, so it was never yours to spend.

The property that makes this trustworthy: **paying a credit card doesn't change it.** Your cash drops and your debt drops by the same amount. Money stopped being yours when you *spent* it, not when the payment cleared. Meanwhile a new card charge drops it exactly once, and so does spending straight from the bank.

Tap the figure on Home to see its full derivation.

### Monthly surplus — "how did this cycle go?"

Income received, minus what you spent and invested, **inside this cycle only**.

This is a **change, not a pot of money.** It is exactly how much better or worse off the cycle left you:

```
Monthly surplus = (cash − card debt) now − (cash − card debt) when the cycle began
```

That identity holds to the paisa, which is why the app shows both endpoints underneath it.

**It can legitimately be larger than your bank balance.** If you started the cycle ₹60,000 underwater on cards and spent most of your salary clearing them, you're ₹62,000 better off while holding only ₹26,000 in cash. Nothing is wrong — the money went into paying down debt rather than piling up in the bank. When that happens the app says so explicitly.

Because it's strictly retrospective, it contains nothing forward-looking: no expected-but-unreceived salary, no unpaid bills. That restraint is what makes it checkable against a real statement.

### Net worth — "what am I actually worth?"

Cash, plus investments at their last marked value, plus money people owe you, minus card debt and what you owe others. The long-run number. Don't spend it.

---

## Your pay cycle

A financial month runs from **payday to the day before the next payday** — not the 1st to the 31st. If you're paid on the 24th, "this month" means 24 July – 23 August, and every screen agrees on that: Home, Insights, Transactions, search, and every total.

Set your payday during first-run setup. If you skipped it, everything falls back to calendar months — worth fixing, because it's the boundary all bucketing depends on.

Cycles are always contiguous: no gap, no day counted twice, and a day-31 payday clamps sensibly in February.

---

## Accounts and opening balances

**This is the one thing most worth getting right.**

> An account's **opening balance** is its balance *immediately before the earliest transaction you've imported* — **not** its balance today.

Set it to today's balance and then import history on top, and every one of those transactions gets subtracted a second time. The account will be wrong by the entire value of the imported history, and nothing will warn you.

If you imported statements starting 24 July, the opening balance is what the account held on 23 July.

### Fixing a balance that's already wrong

Two tools, and they are not interchangeable:

- **Edit the opening balance** when the error is at the *start* of history — the case above. This shifts every derived balance without inventing a transaction.
- **Reconcile** when the gap arose *now*: a cash purchase you never logged, a fee you missed. This posts a dated "Balance adjustment" row, because money really did move and you just don't know exactly where.

Adjustments move your balances but are **excluded from Income and Spent** — a correction isn't earnings, and letting it count would distort your surplus and every insight built on it.

---

## Credit cards

A card's billing cycle is its own thing, unrelated to your pay cycle.

- **Statement day** — the day the bill is generated. A statement dated the 25th covers charges **up to the 24th**; anything charged *on* the 25th belongs to the next cycle.
- **Due day** — when payment is due, usually a couple of weeks later.

Three figures that legitimately differ, and are all correct at once:

| Figure | Means |
|---|---|
| **Last statement** | What the closed bill totalled, and whether it's been paid |
| **Spent this cycle** | Charges since the last statement closed — not yet billed |
| **Outstanding** | Everything owed right now, lifetime, billed or not |

Paying a statement in full while still holding un-billed charges is normal: the statement shows "Paid in full" and Outstanding stays non-zero.

Overpay a card and it shows as a **credit**, not a negative balance. And a bill short by a rupee or less is treated as settled — hand-entered amounts get rounded, and rounding residue is not a debt.

---

## Investments, and a fixed deposit end to end

The app has **no price feed**. It cannot know what your fund is worth today, so it never pretends to. Value is whatever you last typed in, shown alongside how long ago that was.

**You never enter a gain.** It's derived:

```
gain = value − everything you've contributed
```

And when you log a contribution *after* marking a value, both value and cost rise by the same amount — so your gain correctly stays put and you never need to re-mark. An investment you've never valued simply reports what you put in.

### Adding a fixed deposit

1. **Money → Investments → Add investment.** Name it, set Type to **Fixed deposit**.
2. **Leave "Planned monthly contribution" blank.** That field reserves money out of Safe to spend *every cycle* — right for a monthly SIP, wrong for a one-off lump sum. Fill it in by mistake and your Safe to spend silently drops by that amount every month.
3. **Record a contribution** for the principal. Choose the account it came from, and **set the date to when the money actually left** — not today. Backdating matters: posting an old FD as today's transaction would wrongly drain your current balance.
4. **When interest accrues,** open the investment and update "What's it worth now?" to principal + interest. The gain appears by itself.

Money moved into an investment is never counted as spending. It's still yours, just somewhere else.

---

## Recurring bills

Add a bill and the app holds it back from Safe to spend until it's actually paid.

All frequencies reserve properly: a **weekly** bill is held back for every occurrence in the cycle (four or five times, not once), and a **yearly** premium is reserved in full in its anniversary cycle. Pay two of a weekly bill's four occurrences and exactly two remain reserved.

The app also watches for subscriptions you haven't told it about — three months of the same charge from the same merchant becomes a suggestion — and flags one whose price has quietly moved.

---

## Goals, splits and refunds

**Goals** reserve their monthly amount from Safe to spend until you contribute. Projections only appear when the data supports one; with no monthly amount set, the app asks for one rather than inventing a timeline.

**Splits** track shared expenses. The transaction records only *your* share; the rest becomes an IOU. Settling one moves real money — an owed-to-me settlement credits your account without counting as income, so your cash rises and your spending falls back to what you actually spent.

**Refunds** are money credited back against earlier spending, not new income. They reduce Spent rather than increasing Income, which keeps both figures honest.

---

## Importing a statement

**Settings → Import a statement.** HDFC, ICICI and Axis Excel exports are supported.

- **Duplicates are detected** by date, amount and description, and counted rather than blanket-matched — two genuinely separate ₹150 payments on the same day won't both be flagged.
- **Transfers need a destination.** A statement only shows money *leaving* the account, never where it went. If a row is a credit-card payment, you must say which card — otherwise the bank is debited and no card is credited, leaving that card's outstanding permanently too high. The import won't commit until every included transfer has one.
- **Card fees are not card payments.** "Annual fee – credit card" is spending *on* the card, and is typed as an expense.
- **Undo** is available immediately after an import, and after deleting a transaction.

Before your first import, set the account's opening balance — see [Accounts and opening balances](#accounts-and-opening-balances).

---

## Teaching it to categorise

Three tiers, in order:

1. **Rules you taught it.** Correct a guess and it writes a rule keyed on the most distinctive word. Correct it again and the rule is rewritten, with confidence knocked down so one correction doesn't become gospel.
2. **A built-in lexicon** of ~160 merchants and ~40 activities.
3. **An AI suggestion**, only when the first two come up short, and only if `GEMINI_API_KEY` is set. It can only pick from your existing categories — it can't invent one — and it's sent only the phrase you typed, never amounts, balances or history.

When it isn't sure it says "Best guess — check this" instead of quietly filing it somewhere. Anything it couldn't categorise is findable later under **Needs review**.

Context words like "birthday", "work" and "solo" are deliberately never learned as rules — they describe *who and why*, not *what*, and would collide across unrelated purchases.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Test suite (~390 tests, no watch) |
| `npm run test:watch` | Tests, re-running on change |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

### Configuration

Everything is optional — copy `.env.example` to `.env.local`:

- **`GEMINI_API_KEY`** — enables the AI categorisation fallback. Without it, `/api/classify` returns 501 and the UI simply shows no suggestion.
- **`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`** — enables login and cross-device sync. Leave unset to run fully local in IndexedDB, with no account.

For Supabase, run the migrations in `supabase/migrations/` in order from the SQL editor.

### Layout

```
src/lib/domain/    Types, money (integer paise), dates, categories, contexts
src/lib/engine/    Analytics, safe-to-spend, recurring, insights, parser, search
src/lib/import/    Bank statement parsers → reviewable drafts
src/lib/data/      Actions and persistence (IndexedDB / Supabase)
src/components/    UI, grouped by screen
tests/             Node's built-in runner over the engine and domain layers
```

The engine and domain layers are pure functions with no I/O, which is why they're testable without mocks. `tests/loader.mjs` resolves the `@/` alias and extensionless imports for the test runner — there's no build step and no test framework dependency.

### A note on money

All amounts are stored as **integer paise**. Floating-point rupees drift the moment you average three months of spending and divide by remaining days, and drift in a money app is indistinguishable from a bug. Every displayed figure is rounded exactly once, at the point of display.
