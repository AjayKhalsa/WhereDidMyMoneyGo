import type {Account,Category,Transaction} from '@/lib/domain/types';
import {formatDayMonth,monthKeyToDate} from '@/lib/domain/dates';
import {spendingDrivers} from './spending-drivers';
import {spendingCalendar} from './spending-calendar';
import {createCategoryLookup} from '@/lib/domain/categories';
import {transactionOccurredBy} from '@/lib/domain/transaction-time';
import {spendingAttribution} from './spending';

export interface MoneyStory {
  id:string;
  kind:'overview'|'merchant'|'category'|'small'|'day'|'source'|'change'|'refund';
  eyebrow:string;
  title:string;
  amount:number;
  amountLabel:string;
  caption:string;
  rows:Transaction[];
  basis:'net'|'gross'|'refunds'|'difference';
  currentRows?:Transaction[];
  previousRows?:Transaction[];
}

/** A playful presentation of ledger facts. No inferred visits, fabricated
 * transaction clocks, budgets, scores or judgments about good/bad spending. */
export function moneyReplay(input:{transactions:Transaction[];categories:Category[];accounts:Account[];month:string;cycleStartDay:number;now:Date}) {
  const report=spendingDrivers(input),calendar=spendingCalendar(input);
  const cards:MoneyStory[]=[];
  if(!report.currentRows.length)return cards;
  cards.push({id:'overview',kind:'overview',eyebrow:'The opening chapter',title:'This is your money story.',amount:report.current.spending,amountLabel:'recorded spending after refunds',caption:`${report.current.count} purchases · ${calendar.recordedDays} days with entries`,rows:report.currentRows,basis:'net'});
  const regular=report.merchants.filter(m=>m.id!=='__unknown'&&m.count>=2).sort((a,b)=>b.count-a.count||b.net-a.net||a.id.localeCompare(b.id))[0];
  if(regular)cards.push({id:'regular',kind:'merchant',eyebrow:'On repeat',title:regular.label,amount:regular.net,amountLabel:'after refunds',caption:`${regular.count} recorded purchases. A familiar name in this chapter.`,rows:regular.rows,basis:'net'});
  // Full-cycle category totals differ from the equal-prefix comparison totals.
  const byCategory=new Map<string,{label:string;rows:Transaction[];amount:number}>();
  const lookup=createCategoryLookup(input.categories);
  const metadata=spendingAttribution(input.transactions.filter(t=>transactionOccurredBy(t,input.now)));
  for(const row of report.currentRows) {
    const group=lookup.groupOf(metadata(row).categoryId??'other');
    const key=group?.id??'other',bucket=byCategory.get(key)??{label:group?.name??'Other',rows:[],amount:0};
    bucket.rows.push(row);bucket.amount+=row.type==='EXPENSE'?row.amount:-row.amount;byCategory.set(key,bucket);
  }
  const top=[...byCategory.entries()].filter(([,b])=>b.amount>0).sort((a,b)=>b[1].amount-a[1].amount||a[0].localeCompare(b[0]))[0];
  if(top)cards.push({id:'category',kind:'category',eyebrow:'The main character',title:top[1].label,amount:top[1].amount,amountLabel:'after refunds',caption:'Your largest recorded spending category this cycle.',rows:top[1].rows,basis:'net'});
  const small=report.currentRows.filter(t=>t.type==='EXPENSE'&&t.amount>0&&t.amount<15000);
  if(small.length>=3)cards.push({id:'small',kind:'small',eyebrow:'The little things',title:'Small taps. Real totals.',amount:small.reduce((n,t)=>n+t.amount,0),amountLabel:'purchases before refunds',caption:`${small.length} purchases below ₹150 each.`,rows:small,basis:'gross'});
  if(calendar.highest)cards.push({id:'day',kind:'day',eyebrow:'A day that stood out',title:formatDayMonth(monthKeyToDate(calendar.highest.date)),amount:calendar.highest.spending,amountLabel:'after refunds',caption:'The highest recorded spending day in this cycle.',rows:calendar.highest.rows,basis:'net'});
  const source=[...report.sources].filter(s=>s.net>0).sort((a,b)=>b.net-a.net||a.source.localeCompare(b.source))[0];
  const names={card:'Credit cards led the way.',bank:'Bank accounts led the way.',cash:'Cash led the way.',unknown:'Some accounts are still unknown.'};
  if(source)cards.push({id:'source',kind:'source',eyebrow:'How you paid',title:names[source.source],amount:source.net,amountLabel:'after refunds',caption:source.source==='unknown'?'These entries have no known account type.':'Your largest payment source for recorded spending.',rows:source.transactions,basis:'net'});
  const changed=report.drivers.find(d=>d.difference!==0);
  if(report.hasComparison&&changed)cards.push({id:'change',kind:'change',eyebrow:'A different chapter',title:changed.label,amount:changed.difference,amountLabel:changed.difference>0?'more recorded spending':'less recorded spending',caption:`Compared with the first ${report.days} days of your previous cycle.`,rows:[...changed.currentRows,...changed.previousRows],currentRows:changed.currentRows,previousRows:changed.previousRows,basis:'difference'});
  if(report.current.refunds>0)cards.push({id:'refund',kind:'refund',eyebrow:'The comeback',title:'Money came back.',amount:report.current.refunds,amountLabel:'posted refunds',caption:'Recorded refunds received this cycle, including returns from earlier purchases.',rows:report.currentRows.filter(t=>t.type==='INCOME'&&t.isRefund),basis:'refunds'});
  return cards;
}
