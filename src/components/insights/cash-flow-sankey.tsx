"use client";

import { useMemo, useState } from "react";
import { useFinance } from "@/lib/hooks/use-finance";
import { useMoneyText, useMoneyTextCompact, usePrivacy } from "@/lib/hooks/use-privacy";
import { cycleMoneyFlow, flowLayout, type FlowNode } from "@/lib/engine/money-visuals";
import { formatMonthLabel } from "@/lib/domain/dates";
import { InfoButton } from "@/components/ui/info-button";
import { Sheet } from "@/components/ui/sheet";
import { TransactionList } from "@/components/transactions/transaction-list";

const colors: Record<FlowNode["kind"], string> = {
  income: "oklch(59% .12 160)", principal: "oklch(58% .1 220)", refund: "oklch(59% .12 160)", gap: "oklch(62% .16 35)",
  spending: "oklch(66% .13 65)", investment: "oklch(57% .17 285)", remaining: "oklch(59% .12 160)",
};

export function CashFlowSankey() {
  const { db, personalTransactions, month, now, cycleStartDay } = useFinance();
  const money = useMoneyText(), compact = useMoneyTextCompact(), { hidden } = usePrivacy();
  const [selected, setSelected] = useState<string | null>(null);
  const report = useMemo(() => cycleMoneyFlow({ transactions: personalTransactions, categories: db?.categories ?? [], investments: db?.investments ?? [], month, now, cycleStartDay }), [personalTransactions, db?.categories, db?.investments, month, now, cycleStartDay]);
  const layout = useMemo(() => flowLayout(report), [report]);
  const node = [...report.sources, ...report.destinations].find(n => n.id === selected);
  const ribbon = (fromY: number, toY: number, band: number, left: boolean) => {
    const a = left ? 0 : 51, b = left ? 49 : 100, control = (a + b) / 2;
    return `M ${a} ${fromY} C ${control} ${fromY}, ${control} ${toY}, ${b} ${toY} L ${b} ${toY + band} C ${control} ${toY + band}, ${control} ${fromY + band}, ${a} ${fromY + band} Z`;
  };
  return <section className="visual-card min-w-0" aria-label="Cash-flow Sankey">
    <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Cash flow</p><h2 className="mt-1 text-lg font-semibold">Where your money went</h2></div><InfoButton title="Cash-flow diagram"><p>Recorded personal income flows into spending, investment contributions and funds left to allocate. Band widths show amounts; tap a label for evidence.</p><p>Card purchases count as spending once. Card repayments and transfers between your accounts are excluded. Linked gifts, reimbursements and money held for others follow the same personal totals as the rest of the app.</p><p>Gold counts as investment. Returned principal is separate from income. Categories with more refunds than purchases supply a net-refund flow, keeping all bands positive and totals balanced.</p><p>A gap is outflows beyond recorded resources, which can use earlier savings or credit. Funds left to allocate are before future commitments; Home shows safe-to-spend. Missing history can affect either figure.</p></InfoButton></div>
    <p className="mt-2 text-xs text-ink-secondary">{formatMonthLabel(month, cycleStartDay)}{report.elapsed < report.days ? " · so far" : ""} · your share</p>
    {hidden ? <p className="py-16 text-center text-sm text-ink-secondary">Diagram hidden while balances are private.</p> : report.total === 0 ? <p className="py-10 text-sm text-ink-secondary">Record income, spending or an investment to see this flow.</p> : <>
      <div className="mt-5 flex justify-between text-[11px] font-medium uppercase tracking-wide text-ink-tertiary"><span>Money in</span><span>Allocated to</span></div>
      <div className="money-sankey relative mt-2" style={{ height: layout.height }}>
        <svg className="money-sankey-bands absolute top-0 h-full" viewBox={`0 0 100 ${layout.height}`} preserveAspectRatio="none" aria-hidden="true">
          {layout.sources.map(n => <g key={n.id}><path d={ribbon(n.bandY, n.centerY, n.band, true)} fill={colors[n.kind]} opacity=".3"/><rect x="0" y={n.bandY} width="1.2" height={n.band} rx=".6" fill={colors[n.kind]}/></g>)}
          <rect x="49" y={layout.centerTop} width="2" height="180" rx="1" fill="var(--color-ink-tertiary)" opacity=".4"/>
          {layout.destinations.map(n => <g key={n.id}><path d={ribbon(n.centerY, n.bandY, n.band, false)} fill={colors[n.kind]} opacity=".32"/><rect x="98.8" y={n.bandY} width="1.2" height={n.band} rx=".6" fill={colors[n.kind]}/></g>)}
        </svg>
        {layout.sources.map(n => <button key={n.id} type="button" onClick={() => setSelected(n.id)} aria-label={`Inspect ${n.label}, ${money(n.amount)}`} className="money-sankey-source absolute left-0 flex flex-col justify-center rounded-lg py-1 pr-2 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent" style={{ top: n.y, height: n.block }}><span className="text-xs leading-snug">{n.label}</span><span className="mt-1 text-sm font-semibold tnum" style={{ color: colors[n.kind] }}>{compact(n.amount)}</span></button>)}
        {layout.destinations.map(n => <button key={n.id} type="button" onClick={() => setSelected(n.id)} aria-label={`Inspect ${n.label}, ${money(n.amount)}`} className="money-sankey-destination absolute right-0 flex flex-col justify-center rounded-lg py-1 pl-2 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent" style={{ top: n.y, height: n.block }}><span className="text-xs leading-snug">{n.label}</span><span className="mt-1 text-sm font-semibold tnum" style={{ color: colors[n.kind] }}>{compact(n.amount)}</span></button>)}
      </div>
      <p className="mt-3 text-xs text-ink-secondary">{report.remaining < 0 ? `${money(-report.remaining)} beyond this cycle’s income and returned principal.` : `${money(report.remaining)} left after recorded spending and investing, before future commitments.`}</p>
    </>}
    <Sheet open={!!node} onClose={() => setSelected(null)} title={node?.label} size="lg">
      {node && <div className="space-y-4"><p className="text-2xl font-semibold tnum">{money(node.amount)}</p><p className="text-sm text-ink-secondary">{node.explanation}</p>{node.rows.length > 0 && <TransactionList transactions={node.rows} showDayTotals={false} showTime/>}</div>}
    </Sheet>
  </section>;
}
