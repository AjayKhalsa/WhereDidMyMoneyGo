import assert from "node:assert/strict";
import test from "node:test";
import { actualTransactionTime, UNKNOWN_TIMING } from "@/lib/domain/transaction-time";
import { timedMealCategory, ruleConditionsMatch } from "@/lib/engine/time-rules";
import { planHistoryEnrichment, discoverTimePatterns, validateEnrichmentChange } from "@/lib/engine/history-enrichment";
import { createSeedDatabase } from "@/lib/data/seed";
import { shareAfterHour, spendByTimeOfDay } from "@/lib/engine/analytics";
import { parseExpenseInput } from "@/lib/engine/parser";
import { MemoryRepository } from "@/lib/data/local-adapter";
import { expense } from "../helpers/factories";
const timing = { source: "user", precision: "exact", timezone: "Asia/Kolkata" } as const;
const now = new Date("2026-10-19T10:00:00Z");
function fixture() { const db=createSeedDatabase(now); db.transactions=[];db.rules=[];return db; }

test("only verified clocks or matching legacy bank evidence establish actual time", () => {
 const t=expense({date:"2026-10-12T23:30:00"});
 assert.equal(actualTransactionTime(t),undefined);
 assert.equal(actualTransactionTime({...t,timing}),t.date);
 const notes=`Gmail bank alert; message xyz; transaction time ${t.date} Asia/Kolkata; source bank`;
 assert.equal(actualTransactionTime({...t,notes}),t.date);
 assert.equal(actualTransactionTime({...t,notes,timing:UNKNOWN_TIMING}),undefined);
 assert.equal(actualTransactionTime({...t,notes:notes.replace('source bank','source gmail')}),undefined);
 assert.equal(actualTransactionTime({...t,date:'2026-02-30T23:30:00',timing}),undefined);
 assert.equal(actualTransactionTime({...t,date:t.date+'Z',timing}),undefined);
});
test("meal boundaries preserve specific food and explicit descriptions",()=>{
 for(const [clock,category] of [['00:00:00','breakfast'],['11:59:59','breakfast'],['12:00:00','lunch'],['16:59:59','lunch'],['17:00:00','snacks'],['19:59:59','snacks'],['20:00:00','dinner'],['23:59:59','dinner']]) assert.equal(timedMealCategory('dining',`2026-10-12T${clock}`),`dining.${category}`);
 assert.equal(timedMealCategory('dining','2026-10-12T21:00:00','Lunch ordered late'),'dining.lunch');
 for(const category of ['essentials.groceries','dining.coffee','dining.drinks','transport.cab'])assert.equal(timedMealCategory(category,'2026-10-12T21:00:00'),undefined);
 assert.equal(timedMealCategory('dining',undefined),undefined);
});
test("history recovers linked evidence, preserves money and personal tags, and is idempotent",()=>{
 const db=fixture(),t=expense({date:'2026-10-12T00:00:00',categoryId:'dining',accountId:'bank',contexts:[{type:'PURPOSE',value:'goa-trip'}]});db.transactions=[t];
 const e={transactionId:t.id,occurredAt:'2026-10-12T22:15:00',source:'bank' as const,amount:t.amount,accountId:'bank',bankDate:'2026-10-12'};
 const plan=planHistoryEnrichment(db,[e],now);assert.equal(plan.changes.length,1);
 const c=plan.changes[0]!;assert.equal(c.after.categoryId,'dining.dinner');assert.equal(c.after.date,e.occurredAt);assert.equal(c.after.amount,t.amount);assert.equal(c.after.accountId,t.accountId);
 assert.ok(c.after.contexts.some(c=>c.value==='goa-trip'));assert.ok(c.after.contexts.some(c=>c.value==='late-night'));
 validateEnrichmentChange(c,t);validateEnrichmentChange(c,c.after);
 assert.throws(()=>validateEnrichmentChange({...c,after:{...c.after,amount:1}},t),/financial/);
 assert.throws(()=>validateEnrichmentChange(c,{...t,description:'Edited elsewhere'}),/changed/);
 db.transactions=[c.after];assert.equal(planHistoryEnrichment(db,[e],now).changes.length,0);
 db.transactions=[t];assert.equal(planHistoryEnrichment(db,[{...e,amount:1}],now).changes.length,0);
 assert.equal(planHistoryEnrichment(db,[e,{...e,occurredAt:'2026-10-12T13:00:00'}],now).changes.length,0);
 db.transactions=[{...t,timing,date:'2026-10-12T13:00:00'}];assert.equal(planHistoryEnrichment(db,[e],now).changes[0]!.after.date,'2026-10-12T13:00:00');
});
test("unknown clocks lose false late-night tags; transfers, refunds, adjustments and future rows are skipped",()=>{
 const db=fixture(),t=expense({date:'2026-10-12T00:00:00',categoryId:'dining',contexts:[{type:'OCCASION',value:'late-night'}]});
 db.transactions=[t,{...t,id:'transfer',type:'TRANSFER'},{...t,id:'refund',type:'INCOME',isRefund:true},{...t,id:'adjustment',categoryId:'adjustment'},{...t,id:'future',date:'2030-10-12T00:00:00'}];
 const p=planHistoryEnrichment(db,[],now);assert.equal(p.changes.length,1);assert.equal(p.changes[0]!.after.contexts.length,0);assert.equal(p.changes[0]!.after.categoryId,'dining');assert.deepEqual(p.unknownTimeIds,[t.id]);
});
test("patterns require independent, consistent examples and remain scoped to merchant, day and time",()=>{
 const rows=['05','06','07','08'].map(day=>expense({merchant:'Corner Cafe',categoryId:'dining.lunch',date:`2026-10-${day}T13:00:00`,timing,contexts:[{type:'PEOPLE',value:'work'}]}));
 const proposals=discoverTimePatterns(rows,[],now);assert.equal(proposals.length,1);
 const rule=proposals[0]!.rule;assert.equal(ruleConditionsMatch(rule,'Corner Cafe','2026-10-12T13:00:00'),true);
 assert.equal(ruleConditionsMatch(rule,'Corner Cafe','2026-10-12T18:00:00'),false);
 assert.equal(ruleConditionsMatch(rule,'Corner Cafe','2026-10-11T13:00:00'),false);
 assert.equal(ruleConditionsMatch(rule,'Different Cafe','2026-10-12T13:00:00'),false);
 assert.equal(ruleConditionsMatch(rule,'Corner Cafe'),false);
 assert.equal(discoverTimePatterns(rows.slice(0,3),[],now).length,0);
 assert.equal(discoverTimePatterns(rows.map(t=>({...t,date:rows[0]!.date})),[],now).length,0);
 assert.equal(discoverTimePatterns(rows.map(t=>({...t,enrichment:{version:1,ruleIds:['automated']}})),[],now).length,0);
 assert.equal(discoverTimePatterns(rows,[rule],now).length,0);
 const parsed=parseExpenseInput('Corner Cafe 250',{rules:[rule],actualTime:'2026-10-12T13:00:00'});
 assert.ok(parsed.contexts.some(c=>c.type==='PEOPLE'&&c.value==='work'));
 assert.ok(!parseExpenseInput('Corner Cafe 250',{rules:[rule]}).contexts.some(c=>c.value==='work'));
});
test("time insights use known-time coverage and retain unknown amounts separately",()=>{
 const rows=[expense({amount:3000,date:'2026-10-12T23:00:00',timing}),expense({amount:1000,date:'2026-10-12T13:00:00',timing}),expense({amount:9000,date:'2026-10-12T00:00:00'})];
 assert.equal(shareAfterHour(rows,20),75);assert.equal(spendByTimeOfDay(rows).unknown,9000);
});
test("memory fallback commits batches atomically and rejects stale previews",async()=>{
 const db=fixture();db.transactions=[expense({categoryId:'dining',date:'2026-10-12T22:00:00',timing}),expense({categoryId:'dining',date:'2026-10-13T22:00:00',timing})];
 const changes=planHistoryEnrichment(db,[],now).changes;assert.equal(changes.length,2);
 const repo=new MemoryRepository();await repo.replaceAll(db);
 await assert.rejects(repo.commitEnrichment([changes[0]!,{...changes[1]!,before:{...changes[1]!.before,description:'stale'}}]),/changed|financial/);
 assert.deepEqual((await repo.load())!.transactions,db.transactions);
 await repo.commitEnrichment(changes);await repo.commitEnrichment(changes);
 assert.equal((await repo.load())!.transactions[0]!.categoryId,'dining.dinner');
});
