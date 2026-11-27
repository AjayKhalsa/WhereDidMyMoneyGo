import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyDatabase} from '@/lib/data/seed';
import {buildCategorySeed} from '@/lib/domain/categories';
import {defaultBudget} from '@/lib/engine/budgets';
import {buildIntegratedContext,applyInsightNarratives} from '@/lib/ai/integrated-context';
import {providerFacts,validateNarratives,type AIResult} from '@/lib/ai/facts';
import type {Insight} from '@/lib/engine/insights';
import {monthKey} from '@/lib/domain/dates';
import {indiaNow} from '@/lib/domain/transaction-time';
import {expense,income,makeAccount,makeInvestment,rs} from '../helpers/factories';

const now=new Date('2026-11-27T10:00:00Z'),month='2026-11-24';
function fixture(){
 const db=createEmptyDatabase();db.categories=buildCategorySeed();db.accounts=[makeAccount({id:'bank',name:'PRIVATE BANK 7900',openingBalance:rs(150000)})];
 db.profile.budgetPlans=[{...defaultBudget(),effectiveFrom:month}];
 db.investments=[makeInvestment({id:'mf',kind:'MUTUAL_FUND',monthlyContribution:rs(30000),cycleTargets:{[month]:rs(10000)}})];
 db.transactions=[expense({id:'dinner',accountId:'bank',merchant:'PRIVATE PERSON',description:'secret text',notes:'secret note',date:'2026-11-25',amount:rs(2918),categoryId:'dining.delivery'}),income({id:'gift',accountId:'bank',date:'2026-11-25',amount:rs(2100)}),expense({id:'old',accountId:'bank',date:'2026-10-25',amount:rs(500),categoryId:'dining.delivery'}),expense({id:'later',accountId:'bank',date:'2026-10-30',amount:rs(90000)}),{...expense({id:'investment',accountId:'bank',date:'2026-11-26',amount:rs(10000)}),type:'INVESTMENT',investmentId:'mf'}];
 db.moneyLinks=[{id:'gift-link',kind:'CONTRIBUTION',incomeId:'gift',expenseId:'dinner',amount:rs(2100),createdAt:'2026-11-25T12:00:00'}];
 return db;
}
const prose={heading:'A useful spending choice',interpretation:'Recorded purchases and planned contributions explain the trade-off.',nextStep:'Choose the spending change that fits your priorities.'};

test('UTC server and Indian phone produce identical snapshots across IST midnight and payday',()=>{
 const db=fixture();db.transactions.push(expense({id:'after-midnight',accountId:'bank',date:'2026-11-28',amount:rs(100)}));
 const initial=process.env.TZ;
 const run=(timezone:string)=>{process.env.TZ=timezone;return ['2026-11-23T19:00:00Z','2026-11-27T19:00:00Z','2026-12-23T19:00:00Z'].map(t=>{const now=new Date(t),month=monthKey(indiaNow(now),24);return [month,buildIntegratedContext(db,month,now,24).snapshot];});};
 try{const utc=run('UTC');assert.deepEqual(utc,run('Asia/Kolkata'));assert.deepEqual(utc,run('America/Los_Angeles'));}finally{if(initial===undefined)delete process.env.TZ;else process.env.TZ=initial;}
});

test('integrated facts use personal spending, effective investment targets and equal history prefixes',()=>{
 const db=fixture(),before=JSON.stringify(db),context=buildIntegratedContext(db,month,now,24);
 assert.equal(context.facts.find(f=>f.id==='spending')!.metrics[0]!.value,rs(818));
 assert.equal(context.facts.find(f=>f.id==='budget_plan')!.metrics.find(m=>m.label==='Investment target')!.value,rs(10000));
 assert.equal(context.facts.find(f=>f.id==='contributions')!.metrics[0]!.value,rs(10000));
 assert.equal(context.facts.find(f=>f.id.startsWith('history_')&&f.transactionIds.includes('old'))!.transactionIds.includes('later'),false);
 for(const key of ['budget','spending','recap','score','affordability'])assert.ok(context.targets!.some(t=>t.key===key));
 assert.equal(JSON.stringify(db),before,'Analysis cannot mutate the financial database');
});

test('private identities and routing keys never enter provider projection; snapshots invalidate on plan changes',()=>{
 const db=fixture(),context=buildIntegratedContext(db,month,now,24),payload=JSON.stringify(providerFacts(context));
 for(const value of ['PRIVATE PERSON','PRIVATE BANK','7900','secret text','secret note','insight:','dinner','gift-link'])assert.equal(payload.includes(value),false,value);
 assert.equal(context.snapshot,buildIntegratedContext({...db,transactions:[...db.transactions].reverse()},month,now,24).snapshot);
 db.investments[0]!.cycleTargets![month]=rs(20000);
 assert.notEqual(context.snapshot,buildIntegratedContext(db,month,now,24).snapshot);
});

test('every enhanced narrative needs the right evidence; partial, invented and numeric responses are rejected',()=>{
 const context=buildIntegratedContext(fixture(),month,now,24);
 const rows=context.targets!.map(t=>({...prose,targetId:t.id,factIds:[t.factIds[0]!]}));
 assert.equal(validateNarratives({narratives:rows},context).length,rows.length);
 assert.throws(()=>validateNarratives({narratives:rows.slice(1)},context));
 assert.throws(()=>validateNarratives({narratives:rows.map((r,i)=>i? r:{...r,targetId:'unknown'})},context));
 assert.throws(()=>validateNarratives({narratives:rows.map((r,i)=>i? r:{...r,factIds:['invented']})},context));
 assert.throws(()=>validateNarratives({narratives:rows.map((r,i)=>i? r:{...r,heading:'Spend ₹999'})},context));
 assert.throws(()=>validateNarratives({narratives:rows.map((r,i)=>i===1?rows[0]:r)},context));
 const first=context.targets![0]!,other=context.facts.find(f=>!first.factIds.includes(f.id))!;
 assert.throws(()=>validateNarratives({narratives:rows.map((r,i)=>i? r:{...r,factIds:[other.id]})},context));
});

test('fallback is immediate and AI cannot change critical tone, money, or supporting entries',()=>{
 const db=fixture(),context=buildIntegratedContext(db,month,now,24);
 const patterns:Insight[]=[{id:'guard',kind:'credit-commitment',tone:'alert',eyebrow:'Commitment',title:'Existing guard',body:'Original explanation',amount:rs(1000),transactions:[db.transactions[0]!],priority:100}];
 assert.equal(applyInsightNarratives(patterns,null,context,db.transactions),patterns);
 context.targets!.push({id:'guard_target',key:'insight:guard',label:'Guard',factIds:['spending']});
 const result:AIResult={snapshot:context.snapshot,model:'synthetic',focus:'overview',generatedAt:now.toISOString(),insights:[{...prose,factIds:['spending']}],narratives:[{...prose,targetId:'guard_target',factIds:['spending']}]};
 const enhanced=applyInsightNarratives(patterns,result,context,db.transactions);
 assert.equal(enhanced[0]!.tone,'alert');assert.equal(enhanced[0]!.amount,rs(1000));assert.equal(enhanced[0]!.transactions,patterns[0]!.transactions);assert.equal(enhanced[0]!.title,prose.heading);
 assert.equal(applyInsightNarratives(patterns,{...result,snapshot:'stale'},context,db.transactions),patterns);
 assert.equal(enhanced[1]!.kind,'analysis');assert.ok(enhanced[1]!.evidence?.length);
});
