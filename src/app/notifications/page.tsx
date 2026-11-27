"use client";
import {useState} from 'react';
import Link from 'next/link';
import {Bell,CalendarDays,CreditCard,RefreshCw,Settings2,Wallet,X} from 'lucide-react';
import {useRouter} from 'next/navigation';
import {useFinance} from '@/lib/hooks/use-finance';
import {useNotifications} from '@/lib/hooks/use-notifications';
import {useMaskedProse} from '@/lib/hooks/use-privacy';
import {PageHeader} from '@/components/layout/month-switcher';
import {DataLoadError} from '@/components/layout/data-load-error';
import {SegmentedControl} from '@/components/ui/fields';
import {Button,EmptyState,Skeleton} from '@/components/ui/primitives';
import {Sheet} from '@/components/ui/sheet';
import {TransactionList} from '@/components/transactions/transaction-list';
const icons={bill:CalendarDays,card:CreditCard,budget:Wallet,recap:CalendarDays,sync:RefreshCw};
export default function NotificationsPage(){
  const {db,status,error:financeError,trackCurrentMonth}=useFinance();
  const {server,alerts,unread,error,loading,mark,refresh}=useNotifications(),masked=useMaskedProse(),router=useRouter();
  const [view,setView]=useState<'all'|'unread'|'dismissed'>('all'),[chosen,setChosen]=useState<string|null>(null),[busy,setBusy]=useState(false);
  if(status==='idle'||status==='loading')return <Skeleton className="h-80 w-full"/>;
  if(status==='error')return <DataLoadError error={financeError}/>;
  const selected=alerts.find(a=>a.key===chosen);
  const visible=alerts.filter(a=>view==='dismissed'?!!server.states[a.key]?.dismissedAt:!server.states[a.key]?.dismissedAt&&(view!=='unread'||!server.states[a.key]?.readAt));
  const act=async(keys:string[],action:'read'|'dismiss'|'restore')=>{setBusy(true);try{await mark(keys,action);}catch{}finally{setBusy(false);}};
  return <div className="space-y-6">
    <PageHeader title="Notifications" description={unread?`${unread} unread · live money alerts`:'Your live money alerts'} action={<Link href="/settings#notifications" aria-label="Notification settings" className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-sunken"><Settings2 className="h-5 w-5" strokeWidth={1.75}/></Link>}/>
    <div className="flex flex-wrap items-center justify-between gap-3"><SegmentedControl label="Notification view" value={view} onChange={setView} options={[{value:'all',label:'Active'},{value:'unread',label:'Unread'},{value:'dismissed',label:'Dismissed'}]}/>{unread>0&&<Button size="sm" disabled={busy} onClick={()=>void act(alerts.filter(a=>!server.states[a.key]?.dismissedAt&&!server.states[a.key]?.readAt).map(a=>a.key),'read')}>Mark all read</Button>}</div>
    {error&&<div role="alert" className="rounded-xl border border-warning/30 p-3 text-sm"><p>{error}</p><button type="button" className="mt-1 min-h-11 text-accent underline" onClick={()=>void refresh()} disabled={loading}>Retry sync</button></div>}
    {!visible.length?<EmptyState icon={<Bell className="h-5 w-5"/>} title={view==='dismissed'?'No dismissed alerts':view==='unread'?'All caught up':'Nothing needs attention'} description={view==='all'?'New reminders appear as bills approach, budgets change or a weekly recap is ready.':'Read and dismissed choices are saved across your devices.'}/>:<div className="space-y-3">
      {visible.map(alert=>{const state=server.states[alert.key],Icon=icons[alert.kind],fresh=!state?.readAt&&!state?.dismissedAt;return <article key={alert.key} className={`rounded-[var(--radius-card)] border bg-surface p-3 sm:p-4 ${alert.tone==='danger'?'border-danger/25':alert.tone==='warning'?'border-warning/25':'border-line'}`}>
        <div className="flex items-start gap-2"><button type="button" className="flex min-h-14 min-w-0 flex-1 gap-3 rounded-xl p-1 text-left focus-visible:outline-2 focus-visible:outline-accent" onClick={()=>{setChosen(alert.key);if(!state?.readAt)void act([alert.key],'read');}}>
          <span className={`mt-0.5 shrink-0 rounded-xl p-2 ${alert.tone==='danger'?'bg-danger-soft text-danger':alert.tone==='warning'?'bg-warning-soft text-warning':'bg-accent-soft text-accent'}`}><Icon className="h-[18px] w-[18px]" strokeWidth={1.75}/></span>
          <span className="min-w-0"><span className={`block text-sm ${fresh?'font-semibold':'font-medium'}`}>{masked(alert.title)}{fresh&&<span aria-label="Unread" className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-accent"/>}</span><span className="mt-1 block text-xs leading-relaxed text-ink-secondary">{masked(alert.body)}</span>{alert.estimated&&<span className="mt-2 inline-block rounded-full bg-surface-sunken px-2 py-1 text-[10px] text-ink-secondary">{alert.kind==='card'?'Estimated bill':'Saved schedule'}</span>}</span>
        </button>{state?.dismissedAt?<Button size="sm" disabled={busy} onClick={()=>void act([alert.key],'restore')}>Restore</Button>:<button type="button" disabled={busy} aria-label={`Dismiss ${alert.title}`} onClick={()=>void act([alert.key],'dismiss')} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-tertiary hover:bg-surface-sunken disabled:opacity-50"><X className="h-4 w-4"/></button>}</div>
      </article>;})}
    </div>}
    <Sheet open={!!selected} onClose={()=>setChosen(null)} title={selected?masked(selected.title):undefined} size="lg">
      {selected&&<div className="space-y-4"><p className="text-sm leading-relaxed text-ink-secondary">{masked(selected.body)}</p>{error&&<p role="alert" className="text-sm text-danger">{error}</p>}
        {selected.url!=='/notifications'&&<Button variant="primary" onClick={()=>{trackCurrentMonth();router.push(selected.url);}}> {selected.kind==='budget'?'View live budget':selected.kind==='sync'?'Open Gmail imports':'Review in Money'} </Button>}
        {selected.transactionIds.length>0&&<TransactionList transactions={(db?.transactions??[]).filter(t=>selected.transactionIds.includes(t.id))} showDayTotals={false} showTime/>}
        <p className="text-xs text-ink-tertiary">Paid or resolved conditions leave the active inbox automatically.</p>
      </div>}
    </Sheet>
  </div>;
}
