"use client";
import { useFinance } from "@/lib/hooks/use-finance";
import { BudgetPanel } from "@/components/insights/budget-panel";
import { MonthSwitcher, PageHeader } from "@/components/layout/month-switcher";
import { DataLoadError } from "@/components/layout/data-load-error";
import { Skeleton } from "@/components/ui/primitives";

export default function BudgetsPage() {
  const { status, error, month }=useFinance();
  if(status==="error") return <DataLoadError error={error}/>;
  if(status!=="ready") return <Skeleton className="h-80 w-full"/>;
  return <div className="space-y-6"><PageHeader title="Budgets" description="Limits, spending and monthly progress." action={<MonthSwitcher/>}/><BudgetPanel key={month}/></div>;
}
