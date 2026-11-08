"use client";

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
import { InsightDetailSheet } from '@/components/insights/insight-detail-sheet';
import { SpendingDrivers } from '@/components/insights/spending-drivers';
import { EmptyState, Section, Skeleton } from '@/components/ui/primitives';

const SpendingExplorer = dynamic(() => import('@/components/insights/spending-explorer').then(m => m.SpendingExplorer));
const SpendingCalendar = dynamic(() => import('@/components/insights/spending-calendar').then(m => m.SpendingCalendar));
const LensAnswers = dynamic(() => import('@/components/insights/lens-answers').then(m => m.LensAnswers));
const AffordabilityCheck = dynamic(() => import('@/components/insights/affordability-check').then(m => m.AffordabilityCheck));
const MonthlyRecap = dynamic(() => import('@/components/insights/monthly-recap').then(m => m.MonthlyRecap));
const FinancialScoreCard = dynamic(() => import('@/components/insights/financial-score').then(m => m.FinancialScoreCard));
const AIInsights = dynamic(() => import('@/components/insights/ai-insights').then(m => m.AIInsights));
const VIEWS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'explore', label: 'Explore', icon: Search },
  { id: 'tools', label: 'Tools', icon: SlidersHorizontal },
] as const;

export default function InsightsPage() {
  const { status, error, insights, monthRows } = useFinance();
  const [active, setActive] = useState<Insight | null>(null);
  const [view, setView] = useState<(typeof VIEWS)[number]['id']>('overview');
  const [showAI, setShowAI] = useState(false);
  if (status === 'loading' || status === 'idle') return <div className="space-y-5"><Skeleton className="h-9 w-40"/><Skeleton className="h-12 w-full rounded-2xl"/><Skeleton className="h-80 w-full rounded-3xl"/></div>;
  if (status === 'error') return <DataLoadError error={error}/>;
  const attention = insights.filter(i => i.tone === 'alert' || i.tone === 'warning');
  const rest = insights.filter(i => i.tone !== 'alert' && i.tone !== 'warning');
  const empty = !monthRows.some(t => t.type === 'EXPENSE' || (t.type === 'INCOME' && t.isRefund)) && insights.length === 0;
  return <div className="space-y-6">
    <PageHeader title="Insights" description="Your money, at a glance." action={<div className="flex items-center gap-1"><InfoButton title="Data quality"><DataQualityCard/></InfoButton><MonthSwitcher/></div>}/>
    <div className="insight-navigation" role="group" aria-label="Insight views">{VIEWS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}><Icon aria-hidden="true" className="h-4 w-4"/>{label}</button>)}</div>
    {empty ? <EmptyState icon={<Lightbulb className="h-5 w-5"/>} title="Your patterns start here" description="Record some spending to see your daily chart, merchants and payment mix."/> : <>
      {view === 'overview' && <div className="space-y-6 chart-reveal">
        <SpendingDrivers/>
        {attention.length > 0 && <Section title="Worth a look"><div className="grid gap-3 sm:grid-cols-2">{attention.slice(0, 2).map(insight => <InsightCard key={insight.id} insight={insight} onSelect={setActive} compact/>)}</div>{attention.length > 2 && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm">{attention.length - 2} more observations</summary><div className="grid gap-3 sm:grid-cols-2">{attention.slice(2).map(insight => <InsightCard key={insight.id} insight={insight} onSelect={setActive} compact/>)}</div></details>}</Section>}
        <SpendingCalendar/>
      </div>}
      {view === 'explore' && <div className="space-y-6 chart-reveal"><Section title="Follow the money"><SpendingExplorer/></Section><Section title="Quick answers"><LensAnswers/></Section>{rest.length > 0 && <Section title="Patterns"><div className="grid gap-3 sm:grid-cols-2">{rest.map(insight => <InsightCard key={insight.id} insight={insight} onSelect={setActive} compact/>)}</div></Section>}</div>}
      {view === 'tools' && <div className="space-y-6 chart-reveal"><Section title="Can I afford it?"><AffordabilityCheck/></Section><details className="visual-card"><summary className="cursor-pointer font-medium">Financial score</summary><div className="mt-4"><FinancialScoreCard/></div></details><details className="visual-card"><summary className="cursor-pointer font-medium">Cycle totals</summary><div className="mt-4"><MonthlyRecap/></div></details><div className="visual-card"><button type="button" aria-expanded={showAI} onClick={() => setShowAI(v => !v)} className="min-h-11 w-full text-left font-medium">{showAI ? 'Hide optional AI analysis' : 'Optional AI analysis'}</button>{showAI && <AIInsights/>}</div></div>}
    </>}
    <InsightDetailSheet insight={active} onClose={() => setActive(null)}/>
  </div>;
}
