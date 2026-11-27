"use client";

import { LazyDetails } from "@/components/ui/lazy-details";
import { SegmentedControl } from "@/components/ui/fields";
import { BudgetSummary } from "@/components/insights/budget-summary";
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { BarChart3, Search, SlidersHorizontal, Lightbulb } from 'lucide-react';
import type { Insight } from '@/lib/engine/insights';
import { useFinance } from '@/lib/hooks/use-finance';
import { MonthSwitcher, PageHeader } from '@/components/layout/month-switcher';
import { DataLoadError } from '@/components/layout/data-load-error';
import { DataQualityCard } from '@/components/home/data-quality-card';
import { InfoButton } from '@/components/ui/info-button';
import { InsightCard } from '@/components/insights/insight-card';
import {useInsightAnalysis,InsightsSource} from '@/components/insights/insight-analysis-provider';
import { SpendingDrivers } from '@/components/insights/spending-drivers';
import { EmptyState, Section, Skeleton } from '@/components/ui/primitives';

const InsightDetailSheet = dynamic(() => import('@/components/insights/insight-detail-sheet').then(m => m.InsightDetailSheet));

const SpendingExplorer = dynamic(() => import('@/components/insights/spending-explorer').then(m => m.SpendingExplorer));
const CashFlowSankey = dynamic(() => import('@/components/insights/cash-flow-sankey').then(m => m.CashFlowSankey));
const IncomeSpendingHistory = dynamic(() => import('@/components/insights/income-spending-history').then(m => m.IncomeSpendingHistory));
const SpendingCalendar = dynamic(() => import('@/components/insights/spending-calendar').then(m => m.SpendingCalendar));
const LensAnswers = dynamic(() => import('@/components/insights/lens-answers').then(m => m.LensAnswers));
const AffordabilityCheck = dynamic(() => import('@/components/insights/affordability-check').then(m => m.AffordabilityCheck));
const MonthlyRecap = dynamic(() => import('@/components/insights/monthly-recap').then(m => m.MonthlyRecap));
const FinancialScoreCard = dynamic(() => import('@/components/insights/financial-score').then(m => m.FinancialScoreCard));
const VIEWS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'explore', label: 'Explore', icon: Search },
  { id: 'tools', label: 'Tools', icon: SlidersHorizontal },
] as const;

export default function InsightsPage() {
  const { status, error, insights:patterns, personalTransactions, month } = useFinance();
  const analysis=useInsightAnalysis(),insights=analysis?.insights??patterns;
  const [activeId,setActiveId]=useState<string|null>(null);
  const active=insights.find(i=>i.id===activeId)??null;
  const setActive=(insight:Insight)=>setActiveId(insight.id);
  const [view, setView] = useState<(typeof VIEWS)[number]['id']>('overview');
  if (status === 'loading' || status === 'idle') return <div className="space-y-5"><Skeleton className="h-9 w-40"/><Skeleton className="h-12 w-full rounded-2xl"/><Skeleton className="h-80 w-full rounded-3xl"/></div>;
  if (status === 'error') return <DataLoadError error={error}/>;
  const empty = !personalTransactions.some(t => t.amount > 0 && t.categoryId !== 'adjustment' && (t.type !== 'TRANSFER' || !!t.investmentId)) && insights.length === 0;
  return <div className="space-y-6">
    <PageHeader title="Insights" description="Understand your spending and your next move." action={<div className="flex items-center gap-1"><InsightsSource/><InfoButton title="Data quality"><DataQualityCard/></InfoButton><MonthSwitcher/></div>}/>
    <SegmentedControl label="Insight views" value={view} onChange={setView} options={VIEWS.map(({ id, label, icon: Icon }) => ({value: id, label: <><Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.75}/>{label}</>}))}/>
    {view === 'overview' && <BudgetSummary/>}
    {empty ? <EmptyState icon={<Lightbulb className="h-5 w-5"/>} title="Your patterns start here" description="Record some spending to see your daily chart, merchants and payment mix."/> : <>
      {view === 'overview' && <div className="space-y-6 chart-reveal">
        {insights.length > 0 && <Section title="What matters now"><div className="grid gap-3 sm:grid-cols-2">{insights.slice(0, 4).map(insight => <InsightCard key={insight.id} insight={insight} onSelect={setActive} compact/>)}</div>{insights.length > 4 && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm">{insights.length - 4} more observations</summary><div className="grid gap-3 sm:grid-cols-2">{insights.slice(4).map(insight => <InsightCard key={insight.id} insight={insight} onSelect={setActive} compact/>)}</div></details>}</Section>}
        <SpendingDrivers/>
        <SpendingCalendar/>
      </div>}
      {view === 'explore' && <div className="space-y-6 chart-reveal"><div className="grid items-start gap-5 xl:grid-cols-2"><CashFlowSankey key={month}/><IncomeSpendingHistory key={month}/></div><Section title="Follow the money"><SpendingExplorer/></Section><Section title="Quick answers"><LensAnswers/></Section></div>}
      {view === 'tools' && <div className="space-y-6 chart-reveal"><Section title="Can I afford it?"><AffordabilityCheck/></Section><LazyDetails className="visual-card" summary="Financial score"><FinancialScoreCard/></LazyDetails><LazyDetails className="visual-card" summary="Cycle totals"><MonthlyRecap/></LazyDetails></div>}
    </>}
    {active && <InsightDetailSheet insight={active} onClose={() => setActiveId(null)}/>}
  </div>;
}
