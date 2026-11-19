import assert from "node:assert/strict";
import test from "node:test";
import { defaultBudget, allocation, validateBudget, planFor, budgetPerformance, compareBudgets, normalizeBudget } from "@/lib/engine/budgets";
import { createEmptyDatabase } from "@/lib/data/seed";
import { expense, income, transfer, investmentTxn, rs, at } from "../helpers/factories";

const month="2026-11-01", now=new Date(2026,10,18);
test("default plan allocates exactly 1.4 lakh; version changes preserve earlier plans",()=>{
  const p=defaultBudget(); assert.equal(allocation(p),rs(140000)); assert.equal(validateBudget(p),null);
  assert.match(validateBudget({...p,investment:rs(100000)})!,/exceed/);
  const a={...p,effectiveFrom:"2026-11-01"},b={...p,effectiveFrom:"2026-12-01",investment:0};
  assert.equal(planFor([b,a],month).investment,rs(70000)); assert.equal(planFor([a,b],"2026-12-01").investment,0);
});
test("dates, refunds, investments and transfers are counted once; unknowns stay visible",()=>{
  const db=createEmptyDatabase();
  const dinner=expense({id:"dinner",amount:rs(3000),date:at("2026-11-03"),categoryId:"dining.dinner",contexts:[{type:"PEOPLE",value:"dating"}]});
  db.transactions=[dinner,income({amount:rs(500),date:at("2026-11-05"),isRefund:true,reversesTransactionId:dinner.id}),transfer({amount:rs(60000),date:at("2026-11-04")}),investmentTxn({amount:rs(30000),date:at("2026-11-04")}),expense({amount:rs(400),categoryId:"missing",date:at("2026-11-04")}),expense({amount:rs(10000),categoryId:"adjustment",date:at("2026-11-04")}),expense({amount:rs(10000),date:at("2026-11-25")})];
  const p=budgetPerformance(db,month,now);
  assert.equal(p.spent,rs(2900)); assert.equal(p.buckets.find(b=>b.id==="food")!.actual,rs(2500));
  assert.equal(p.invested,rs(30000)); assert.equal(p.buckets.find(b=>b.id==="unmapped")!.actual,rs(400));
});
test("leaf mapping overrides group; near and over limits expose category overshoots",()=>{
  const db=createEmptyDatabase();
  db.transactions=[expense({amount:rs(11760),categoryId:"bills.insurance",date:at("2026-11-04")}),expense({amount:rs(18000),categoryId:"dining.lunch",date:at("2026-11-04")})];
  const p=budgetPerformance(db,month,now);
  assert.equal(p.buckets.find(b=>b.id==="planned")!.actual,rs(11760));
  assert.equal(p.buckets.find(b=>b.id==="bills")!.actual,0);
  assert.equal(p.buckets.find(b=>b.id==="food")!.status,"near");
  assert.equal(p.overshoot,rs(1760)); assert.ok(p.score!<100);
});
test("payday cycles and gold-linked investments are respected",()=>{
  const db=createEmptyDatabase(); db.investments=[{id:"gold",name:"Gold repayment",kind:"GOLD",monthlyContribution:rs(30000),isActive:true,createdAt:at("2026-10-01")}];
  db.transactions=[investmentTxn({amount:rs(30000),investmentId:"gold",date:at("2026-11-03")}),expense({amount:rs(1000),date:at("2026-10-24"),categoryId:"dining"}),expense({amount:rs(999),date:at("2026-10-23"),categoryId:"dining"})];
  const p=budgetPerformance(db,"2026-10-24",now,24);
  assert.equal(p.invested,rs(30000)); assert.equal(p.spent,rs(1000));
});

test("legacy plans merge investment targets and dining allowances without losing custom amounts",()=>{
  const p=defaultBudget();
  const legacy={...p,investment:undefined,gold:rs(30000),mutualFunds:rs(40000),buckets:[{id:'food',label:'Personal',limit:rs(11000),categoryIds:['dining']},{id:'dates',label:'Dates',limit:rs(13000),categoryIds:['entertainment']}]};
  const n=normalizeBudget(legacy as unknown as ReturnType<typeof defaultBudget>);
  assert.equal(n.investment,rs(70000));assert.equal(n.buckets.length,1);assert.equal(n.buckets[0]!.limit,rs(24000));assert.equal(n.gold,undefined);
});
test("comparison matches elapsed days and explains category changes, excluding later prior purchases",()=>{
 const db=createEmptyDatabase();db.transactions=[expense({amount:rs(8000),date:at('2026-11-05'),categoryId:'dining'}),expense({amount:rs(10000),date:at('2026-10-05'),categoryId:'dining'}),expense({amount:rs(90000),date:at('2026-10-25'),categoryId:'dining'})];
 const c=compareBudgets(db,month,new Date(2026,10,10));assert.equal(c.matchedDays,10);assert.equal(c.prior.spent,rs(10000));assert.equal(c.delta,rs(-2000));assert.equal(c.percent,-20);assert.equal(c.changes[0]!.delta,rs(-2000));
});
test("shorter prior months clamp both sides, and empty history does not invent improvement",()=>{
 const db=createEmptyDatabase();assert.equal(compareBudgets(db,month,now).hasPrior,false);
 db.transactions=[expense({amount:rs(1000),date:at('2026-03-28'),categoryId:'dining'}),expense({amount:rs(9999),date:at('2026-03-30'),categoryId:'dining'}),expense({amount:rs(2000),date:at('2026-02-28'),categoryId:'dining'})];
 const c=compareBudgets(db,'2026-03-01',new Date(2026,3,1));assert.equal(c.matchedDays,28);assert.equal(c.matched.spent,rs(1000));assert.equal(c.delta,rs(-1000));
});
