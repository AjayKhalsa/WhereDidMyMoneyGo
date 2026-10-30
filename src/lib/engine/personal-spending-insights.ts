import type {Insight,InsightInput} from './insights';
import type {Transaction} from '@/lib/domain/types';
import {monthTransactions} from './analytics';
import {isSpendingActivity,netSpending,spendingAttribution} from './spending';
import {categoryPaymentSources} from './payment-source-breakdown';
import {automaticSubcategory} from './subcategory-recognition';
import {recognizedMerchants} from './merchant-recognition';
import {merchantKey} from './merchant-identity';
import {formatMoney} from '@/lib/domain/money';

/** Additional views of recorded consumption, never rewritten categories or
 * estimated bank balances. Every headline retains its exact financial rows. */
export function personalSpendingInsights(input:InsightInput):Insight[]{
 const {transactions,accounts,month,cycleStartDay}=input,metadata=spendingAttribution(transactions);
 const rows=monthTransactions(transactions,month,cycleStartDay).filter(t=>isSpendingActivity(metadata(t)));
 const out:Insight[]=[];
 const food=rows.filter(t=>(input.groupFor??(id=>id.split('.')[0]!))(metadata(t).categoryId??'other')==='dining');
 const channels=new Map<string,Transaction[]>();
 for(const t of food){
  const m=metadata(t),specific=m.categoryId??'';
  const channel=['dining.delivery','dining.groceries','dining.restaurant','dining.coffee','dining.tea'].includes(specific)?specific:automaticSubcategory(m.merchant??'')?.categoryId;
  const label=channel==='dining.delivery'?'Delivery':channel==='dining.groceries'?'Groceries':['dining.restaurant','dining.coffee','dining.tea'].includes(channel??'')?'Restaurants & refreshments':'Other recorded dining';
  channels.set(label,[...channels.get(label)??[],t]);
 }
 const foodTotal=netSpending(food,transactions);
 if(foodTotal>=100000&&channels.size>=2){
  const summary=[...channels].map(([label,list])=>({label,net:netSpending(list,transactions)})).sort((a,b)=>b.net-a.net);
  out.push({id:'food-channels',kind:'food-mix',tone:'neutral',eyebrow:'Your food habits',title:'Delivery, groceries and eating out',amount:foodTotal,basis:'spending',body:summary.map(s=>`${s.label}: ${formatMoney(s.net)}`).join(' · ')+'. Recorded refunds are included; unclassified dining stays separate.',transactions:food,priority:48,action:'See food payments'});
 }
 const split=categoryPaymentSources(rows,transactions,accounts,()=> 'all').get('all')??[];
 if(netSpending(rows,transactions)>=100000&&split.filter(s=>s.outgoing>0).length>=2){
  const labels={card:'Credit cards',bank:'Bank accounts',cash:'Cash',unknown:'Account unknown'};
  out.push({id:'payment-source-mix',kind:'payment-source',tone:'neutral',eyebrow:'How you paid',title:'Your card versus bank spending',amount:netSpending(rows,transactions),basis:'spending',body:split.sort((a,b)=>b.net-a.net).map(s=>`${labels[s.source]}: ${formatMoney(s.net)}`).join(' · ')+'. After recorded refunds; card bill repayments are excluded.',transactions:rows,priority:46,action:'See spending sources'});
 }
 const reversed=new Set(transactions.filter(t=>t.type==='INCOME'&&t.isRefund&&t.reversesTransactionId).map(t=>t.reversesTransactionId));
 const subscriptions=new Map<string,Transaction[]>();
 for(const t of transactions){
  if(t.type!=='EXPENSE'||t.categoryId!=='bills.subscription'||!t.accountId||t.amount<=0||reversed.has(t.id))continue;
  const name=t.merchant??t.description,key=merchantKey(name);if(!key)continue;
  const identity=JSON.stringify([key,t.accountId??'']);subscriptions.set(identity,[...subscriptions.get(identity)??[],t]);
 }
 const current=new Set(rows.map(t=>t.id));
 for(const [key,list] of subscriptions){
  const sorted=[...list].sort((a,b)=>b.date.localeCompare(a.date)),[latest,previous,older]=sorted;
  if(!latest||!previous||!older||!current.has(latest.id))continue;
  const day=(t:Transaction)=>Date.parse(t.date.slice(0,10)+'T12:00:00Z');
  if(![day(latest)-day(previous),day(previous)-day(older)].every(g=>g>=24*86400000&&g<=36*86400000))continue;
  if(Math.abs(previous.amount-older.amount)>Math.max(100,Math.round(older.amount*.01)))continue;
  const baseline=Math.round((previous.amount+older.amount)/2),delta=latest.amount-baseline;
  if(Math.abs(delta)<2000||Math.abs(delta)/baseline<.1)continue;
  const known=recognizedMerchants(latest.merchant??latest.description),name=known.length===1?known[0]!.name:latest.merchant??'Subscription';
  out.push({id:`subscription-charge:${key}`,kind:'subscription-change',tone:delta>0?'warning':'positive',eyebrow:'Subscription charge changed',title:`${name} charged ${delta>0?'more':'less'} this time`,amount:latest.amount,basis:'gross',body:`${formatMoney(latest.amount)} versus ${formatMoney(baseline)} across the previous two monthly charges on this account. This may reflect a plan, tax or price change; it does not update your recurring schedule.`,comparison:{current:latest.amount,average:baseline,difference:delta,percentChange:delta/baseline*100,monthsCounted:2},transactions:[latest],priority:delta>0?62:47,action:'See this charge'});
 }
 return out;
}
