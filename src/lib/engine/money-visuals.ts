import type { Category, Investment, Transaction } from "@/lib/domain/types";
import { createCategoryLookup } from "@/lib/domain/categories";
import { addMonths, daysInMonth, elapsedDaysInMonth, monthKeyToDate, previousMonths, toDateInputValue } from "@/lib/domain/dates";
import {  transactionOccurredBy } from "@/lib/domain/transaction-time";
import { monthTotals, monthTransactions } from "./analytics";
import { investmentMovement, isSpendingActivity, spendingAttribution } from "./spending";

/** Input is the same personal projection used by FinanceContext, never raw bank totals. */
export interface VisualInput { transactions: Transaction[]; month: string; now: Date; cycleStartDay: number }

function period(input: VisualInput) {
  const all = input.transactions.filter(t => transactionOccurredBy(t, input.now));
  const metadata = spendingAttribution(all);
  const rows = monthTransactions(all, input.month, input.cycleStartDay).filter(t => t.amount > 0 && metadata(t).categoryId !== "adjustment");
  const totals = monthTotals(all, input.month, input.cycleStartDay);
  return { all, rows, metadata, totals, days: daysInMonth(input.month, input.cycleStartDay), elapsed: elapsedDaysInMonth(input.now, input.month, input.cycleStartDay) };
}

export function spendingPace(input: VisualInput & { limit: number }) {
  const p = period(input);
  const rows = p.rows.filter(t => isSpendingActivity(p.metadata(t)));
  const byDay = new Map<string, Transaction[]>();
  for (const row of rows) byDay.set(row.date.slice(0, 10), [...(byDay.get(row.date.slice(0, 10)) ?? []), row]);
  let cumulative = 0;
  const points = Array.from({ length: p.days }, (_, i) => {
    const date = monthKeyToDate(input.month); date.setDate(date.getDate() + i);
    const key = toDateInputValue(date), dayRows = byDay.get(key) ?? [];
    const net = dayRows.reduce((sum, t) => sum + (t.type === "EXPENSE" ? t.amount : -t.amount), 0);
    cumulative += net;
    return { day: i + 1, date: key, actual: i < p.elapsed ? cumulative : null, ideal: Math.round(input.limit * (i + 1) / p.days), rows: dayRows, net };
  });
  const expected = Math.round(input.limit * p.elapsed / p.days);
  return { points, rows, days: p.days, elapsed: p.elapsed, limit: input.limit, spending: p.totals.spent, expected, difference: p.totals.spent - expected };
}

export function incomeSpendingHistory(input: VisualInput) {
  return [...previousMonths(input.month, 5, input.cycleStartDay), input.month].map(month => {
    const p = period({ ...input, month });
    return { month, ...p.totals, days: p.days, elapsed: p.elapsed, partial: p.elapsed < p.days,
      hasRecords: p.rows.some(t => t.type !== "TRANSFER" || investmentMovement(t) < 0),
      incomeRows: p.rows.filter(t => t.type === "INCOME" && !t.isRefund),
      spendingRows: p.rows.filter(t => isSpendingActivity(p.metadata(t))),
      investmentRows: p.rows.filter(t => t.type === "INVESTMENT" || investmentMovement(t) < 0),
      remaining: p.totals.income - p.totals.spent - p.totals.invested,
    };
  });
}

export interface FlowNode {
  id: string; label: string; amount: number; kind: "income" | "principal" | "refund" | "gap" | "spending" | "investment" | "remaining";
  rows: Transaction[]; explanation: string;
}

export function cycleMoneyFlow(input: VisualInput & { categories: Category[]; investments: Investment[] }) {
  const p = period(input), lookup = createCategoryLookup(input.categories);
  const spend = new Map<string, { id: string; label: string; amount: number; rows: Transaction[] }>();
  for (const t of p.rows) {
    if (!isSpendingActivity(p.metadata(t))) continue;
    const group = lookup.groupOf(p.metadata(t).categoryId ?? "other");
    const id = group?.id ?? "other";
    const entry = spend.get(id) ?? { id, label: group?.name ?? "Other spending", amount: 0, rows: [] };
    entry.amount += t.type === "EXPENSE" ? t.amount : -t.amount; entry.rows.push(t); spend.set(id, entry);
  }
  const positive = [...spend.values()].filter(g => g.amount > 0).sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  const excessRefunds = [...spend.values()].filter(g => g.amount < 0);
  const grouped = positive.slice(0, 3);
  if (positive.length > 3) grouped.push({ id: "other-groups", label: "Other spending", amount: positive.slice(3).reduce((sum, g) => sum + g.amount, 0), rows: positive.slice(3).flatMap(g => g.rows) });
  const destinations: FlowNode[] = grouped.map(g => ({ ...g, id: `spend:${g.id}`, kind: "spending", explanation: "Your share of purchases, less posted refunds in this category. Linked refunds keep their posting date." }));
  const investmentGroups = new Map<string, FlowNode>();
  for (const t of p.rows.filter(t => t.type === "INVESTMENT")) {
    const investment = input.investments.find(i => i.id === t.investmentId);
    const group = investment?.kind === "GOLD" ? "Gold" : investment?.kind === "MUTUAL_FUND" ? "Mutual funds" : "Other investments";
    const node = investmentGroups.get(group) ?? { id: `invest:${group}`, label: group, amount: 0, kind: "investment", rows: [], explanation: "Recorded contributions. Monthly targets and market gains are excluded." };
    node.amount += t.amount; node.rows.push(t); investmentGroups.set(group, node);
  }
  destinations.push(...investmentGroups.values());
  const incomeRows = p.rows.filter(t => t.type === "INCOME" && !t.isRefund);
  const principalRows = p.rows.filter(t => investmentMovement(t) < 0);
  const sources: FlowNode[] = [
    { id: "income", label: "Income", amount: p.totals.income, kind: "income", rows: incomeRows, explanation: "Recorded personal income. Early salary follows your app's salary-cycle attribution. Refunds and money held for others are excluded." },
    { id: "principal", label: "Principal returned", amount: p.totals.investmentWithdrawals, kind: "principal", rows: principalRows, explanation: "Explicitly linked investment withdrawals move existing assets back into cash; they are separate from income." },
    { id: "refunds", label: "Net refunds", amount: -excessRefunds.reduce((sum, g) => sum + g.amount, 0), kind: "refund", rows: excessRefunds.flatMap(g => g.rows), explanation: "Refunds exceeded purchases in these categories this cycle. The excess appears here so every flow stays positive and reconciles." },
  ].filter(n => n.amount > 0) as FlowNode[];
  const resources = sources.reduce((sum, n) => sum + n.amount, 0);
  const outflows = destinations.reduce((sum, n) => sum + n.amount, 0);
  const difference = resources - outflows;
  if (difference < 0) sources.push({ id: "gap", label: "Gap to income", amount: -difference, kind: "gap", rows: [], explanation: "Net spending and investing exceeded this cycle's recorded income and returned principal. Earlier savings, credit or missing history can explain the gap; this is not a measured loan balance." });
  if (difference > 0) destinations.push({ id: "remaining", label: "Left to allocate", amount: difference, kind: "remaining", rows: [], explanation: "Income and returned principal left after recorded personal spending and investment contributions. Future bills, existing card debt and planned contributions are still commitments. Home shows safe-to-spend after those commitments." });
  return { sources, destinations, total: Math.max(resources, outflows), remaining: difference, totals: p.totals, from: input.month, to: addMonths(input.month, 1, input.cycleStartDay), elapsed: p.elapsed, days: p.days };
}

/** Minimum row space keeps touch labels readable; ribbon thickness stays proportional. */
export function flowLayout(report: ReturnType<typeof cycleMoneyFlow>) {
  const scale = report.total > 0 ? 180 / report.total : 0;
  const place = (nodes: FlowNode[]) => {
    let y = 0;
    const positioned = nodes.map(node => {
      const band = node.amount * scale, block = Math.max(52, band + 12);
      const item = { ...node, y, block, band, bandY: y + (block - band) / 2 };
      y += block + 6; return item;
    });
    return { nodes: positioned, height: Math.max(0, y - 6) };
  };
  const left = place(report.sources), right = place(report.destinations);
  const height = Math.max(left.height, right.height, 180) + 24;
  const centerTop = (height - 180) / 2;
  const align = (side: typeof left) => {
    let offset = centerTop;
    return side.nodes.map(node => { const item = { ...node, y: node.y + (height - side.height) / 2, bandY: node.bandY + (height - side.height) / 2, centerY: offset }; offset += node.band; return item; });
  };
  return { height, centerTop, sources: align(left), destinations: align(right) };
}
