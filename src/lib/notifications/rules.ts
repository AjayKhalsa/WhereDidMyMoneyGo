import type { Database } from '@/lib/domain/types';
import { addMonths, daysBetween, formatDayMonth, monthKey, monthKeyToDate, toDateInputValue } from '@/lib/domain/dates';
import { indiaNow, transactionOccurredBy } from '@/lib/domain/transaction-time';
import { formatMoney } from '@/lib/domain/money';
import { budgetPerformance } from '@/lib/engine/budgets';
import { summariseCreditCard } from '@/lib/engine/analytics';
import { isSpendingActivity, spendingAttribution, spendingSummary } from '@/lib/engine/spending';
import { projectMoneyLinks } from '@/lib/engine/money-links';
import { overlappingRecurringRules, possibleRecurringPayments, resolveRecurringPayments } from '@/lib/engine/recurring-payments';
import { notificationKey, type MoneyNotification, type NotificationPreferences, type NotificationSync } from './model';

const labelDay = (day: string) => formatDayMonth(monthKeyToDate(day));
function dueStage(days: number) { return days < 0 ? 'overdue' : days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'soon'; }
function dueCopy(days: number) { return days < 0 ? `${-days} day${days === -1 ? '' : 's'} past the saved due date` : days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due in ${days} days`; }

/** Live signals are read-only and independent of the month pinned in Insights.
 * Filter clocks against the real instant first. Calendar engines then use the
 * Indian wall date on every host; no future entry or second link projection is introduced. */
export function moneyNotifications(db: Database, now: Date, preferences: NotificationPreferences, sync?: NotificationSync): MoneyNotification[] {
  const alerts: MoneyNotification[] = [];
  const wall = new Date(indiaNow(now));
  const today = indiaNow(now).slice(0,10), start = monthKeyToDate(today);
  const posted = db.transactions.filter(t => transactionOccurredBy(t,now));
  const personal = projectMoneyLinks({transactions:posted,moneyLinks:db.moneyLinks},now).transactions;
  const cycleDay = db.incomeSources.filter(s=>s.isActive&&s.recurring).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0]?.dayOfMonth ?? 1;
  const cycle = monthKey(wall,cycleDay);
  if (preferences.bills) {
    const from = new Date(start); from.setDate(from.getDate()-3);
    const to = new Date(start); to.setDate(to.getDate()+3);
    const overlaps = overlappingRecurringRules(db.recurring);
    for (const slot of resolveRecurringPayments(db.recurring,posted,from,to,now)) {
      if (slot.rule.type !== 'EXPENSE') continue;
      const refunded=slot.transaction&&posted.some(t=>t.type==='INCOME'&&t.isRefund&&t.reversesTransactionId===slot.transaction!.id);
      if(slot.transaction&&!refunded)continue;
      const days = daysBetween(start,slot.dueDate), date = toDateInputValue(slot.dueDate);
      const possible = possibleRecurringPayments(slot.rule,posted,slot.dueDate,now);
      // A generic processor label (for example Apple) cannot prove which
      // subscription was paid. Same-account/amount clues prompt review only.
      const uncertain=posted.filter(t=>!t.recurringId&&t.type==='EXPENSE'&&t.categoryId?.split('.')[0]==='bills'&&slot.rule.accountId&&t.accountId===slot.rule.accountId&&t.amount===slot.rule.amount&&Math.abs(daysBetween(monthKeyToDate(t.date.slice(0,10)),slot.dueDate))<=3);
      const candidates=[...new Map([...possible,...uncertain,...(slot.transaction?[slot.transaction]:[])].map(t=>[t.id,t])).values()];
      const review = candidates.length > 0 || overlaps.has(slot.rule.id);
      alerts.push({key:notificationKey('bill',slot.rule.id,date,review?'review':dueStage(days)),kind:'bill',
        title:review ? `Review ${slot.rule.description} payment` : `${slot.rule.description} ${dueCopy(days)}`,
        body:review ? 'A saved charge or overlapping schedule may cover this bill. Check the link before recording another payment.' : `${formatMoney(slot.rule.amount)} scheduled for ${labelDay(date)}. Confirm any auto-debit in your bank before paying.`,
        amount:slot.rule.amount,date,estimated:true,url:'/money#bills',priority:review?54:days<=0?90:days===1?82:65,tone:days<0&&!review?'warning':'neutral',transactionIds:candidates.map(t=>t.id)});
    }
    // Card estimates are labelled; unbilled outstanding is never presented as the bill.
    for (const account of db.accounts.filter(a=>a.isActive&&a.type==='CREDIT_CARD')) {
      const card=summariseCreditCard(account,db.creditCards.find(c=>c.accountId===account.id),posted,wall);
      const statement=card.lastStatement;if(!statement||statement.paidInFull||!card.dueDate)continue;
      const days=daysBetween(start,card.dueDate),amount=Math.max(0,statement.amount-statement.paidAmount);
      if(days < -7||days>3||amount<=0)continue;
      const date=toDateInputValue(card.dueDate),estimated=statement.source!=='issuer';
      alerts.push({key:notificationKey('card',account.id,date,dueStage(days)),kind:'card',title:`${account.name} ${estimated?'payment check':dueCopy(days)}`,
        body:`${estimated?'Estimated statement remainder':'Issuer statement remainder'}: ${formatMoney(amount)}, ${dueCopy(days)}. ${estimated?'Confirm the issuer’s bill before paying.':'Check any payment still processing with the bank.'}`,
        amount,date,estimated,url:'/money#cards',priority:days<=0?98:days===1?92:76,tone:days<0?'danger':days<=1?'warning':'neutral',transactionIds:[]});
    }
  }
  if (preferences.budgets) {
    const budget=budgetPerformance({...db,transactions:personal,moneyLinks:[]},cycle,wall,cycleDay);
    const candidates=[...budget.buckets.filter(b=>b.id!=='unmapped'&&b.limit>0).map(b=>({id:b.id,label:b.label,actual:b.actual,limit:b.limit,ids:b.transactionIds})),{id:'total',label:'Total spending',actual:budget.spent,limit:budget.limit,ids:budget.buckets.flatMap(b=>b.transactionIds)}];
    for(const b of candidates){
      if(b.limit<=0||b.actual<.8*b.limit)continue;
      const exhausted=b.actual>=b.limit;
      if(!exhausted&&(b.id==='total'||b.actual<=b.limit*(budget.elapsed/budget.days+.05)))continue;
      alerts.push({key:notificationKey('budget',cycle,b.id,exhausted?'100':'80'),kind:'budget',title:`${b.label} ${b.actual>b.limit?'over budget':exhausted?'budget used up':'near its limit'}`,
        body:`${formatMoney(b.actual)} of ${formatMoney(b.limit)} used${b.actual>b.limit?` · ${formatMoney(b.actual-b.limit)} over` : exhausted?'. No allowance remains.':'. Spending is ahead of this cycle’s pace.'}`,
        amount:b.actual,url:'/budgets',priority:b.id==='total'?91:exhausted?78:55,tone:b.actual>b.limit?'danger':'warning',transactionIds:b.ids});
    }
  }
  if(preferences.weeklyRecap){
    const currentMonday=new Date(start);currentMonday.setDate(currentMonday.getDate()-((currentMonday.getDay()+6)%7));
    const previousMonday=new Date(currentMonday);previousMonday.setDate(previousMonday.getDate()-7);
    const from=toDateInputValue(previousMonday),to=toDateInputValue(currentMonday);
    const metadata=spendingAttribution(personal);
    const rows=personal.filter(t=>t.date.slice(0,10)>=from&&t.date.slice(0,10)<to&&t.amount>0&&metadata(t).categoryId!=='adjustment'&&(isSpendingActivity(metadata(t))||t.type==='INVESTMENT'));
    if(rows.length){
      const summary=spendingSummary(rows,personal),invested=rows.filter(t=>t.type==='INVESTMENT').reduce((sum,t)=>sum+t.amount,0);
      const end=new Date(currentMonday);end.setDate(end.getDate()-1);
      alerts.push({key:notificationKey('recap',from),kind:'recap',title:'Your week in money',body:`${labelDay(from)}–${formatDayMonth(end)}: ${summary.spending<0?`${formatMoney(-summary.spending)} in net refunds`:`${formatMoney(summary.spending)} personal spending`} · ${formatMoney(invested)} invested.`,amount:summary.spending,date:from,url:'/notifications',priority:35,tone:'neutral',transactionIds:rows.map(t=>t.id)});
    }
  }
  const issue=syncNotification(sync,now,preferences);
  if(issue)alerts.push(issue);
  return alerts.sort((a,b)=>b.priority-a.priority||a.key.localeCompare(b.key));
}

export function syncNotification(sync: NotificationSync | undefined, now: Date, preferences: NotificationPreferences): MoneyNotification | undefined {
  if(!preferences.syncIssues||!sync||sync.state==='ok'||sync.state==='disconnected')return;
  const title=sync.state==='failed'?'Email imports need attention':sync.state==='stale'?'Email imports are overdue':sync.state==='review'?'Imported payments need review':'Email imports have unfinished work';
  return {key:notificationKey('sync',indiaNow(now).slice(0,10),sync.state),kind:'sync',title,
    body:sync.state==='review'?`${sync.review??0} alerts need a payment or link decision. Check saved entries before adding a payment.`:'Open Gmail imports to check the connection or continue the sync.',url:'/settings#gmail',priority:sync.state==='failed'?95:60,tone:'warning',transactionIds:[]};
}

export function liveNotificationCycle(db: Database, now: Date) {
  const day=db.incomeSources.filter(s=>s.isActive&&s.recurring).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0]?.dayOfMonth??1;
  const cycle=monthKey(new Date(indiaNow(now)),day);
  return {cycle,end:addMonths(cycle,1,day)};
}
