import assert from "node:assert/strict";
import test from "node:test";
import { cycleMoneyFlow, flowLayout, incomeSpendingHistory, spendingPace } from "@/lib/engine/money-visuals";
import { monthTotals } from "@/lib/engine/analytics";
import { projectMoneyLinks } from "@/lib/engine/money-links";
import { buildCategorySeed } from "@/lib/domain/categories";
import { at, expense, income, investmentTxn, makeInvestment, rs, transfer } from "../helpers/factories";
import type { MoneyLink, Transaction } from "@/lib/domain/types";

const month = "2026-11-24", now = new Date("2026-11-26T12:00:00Z"), cycleStartDay = 24;
const base = { month, now, cycleStartDay };
const categories = buildCategorySeed();
const flow = (transactions: Transaction[]) => cycleMoneyFlow({ ...base, transactions, categories, investments: [] });
const balanced = (report: ReturnType<typeof flow>) => {
  assert.equal(report.sources.reduce((sum, n) => sum + n.amount, 0), report.total);
  assert.equal(report.destinations.reduce((sum, n) => sum + n.amount, 0), report.total);
  assert.ok([...report.sources, ...report.destinations].every(n => n.amount > 0 && Number.isSafeInteger(n.amount)));
  assert.equal(report.remaining, report.totals.income - report.totals.spent - report.totals.invested);
};

test("budget pace ends actuals at the Indian day, excludes repayments and targets the whole cycle", () => {
  const transactions = [income({date:at('2026-11-23'),amount:rs(140000)}),expense({date:at('2026-11-24'),amount:rs(10000)}),expense({date:at('2026-11-26'),amount:rs(3000)}),transfer({date:at('2026-11-25'),amount:rs(10000)}),investmentTxn({date:at('2026-11-25'),amount:rs(30000)}),expense({date:at('2026-11-27'),amount:rs(5000)})];
  const report = spendingPace({...base,transactions,limit:rs(60000)});
  assert.equal(report.days,30); assert.equal(report.elapsed,3);
  assert.equal(report.spending,rs(13000));assert.equal(report.expected,rs(6000));assert.equal(report.difference,rs(7000));
  assert.deepEqual(report.points.slice(0,3).map(p=>p.actual),[rs(10000),rs(10000),rs(13000)]);
  assert.ok(report.points.slice(3).every(p=>p.actual===null));assert.equal(report.points.at(-1)?.ideal,rs(60000));
  assert.equal(report.points.at(-1)?.date,'2026-12-23');
});

test("pace allows refunds below zero and does not subtract ordinary income from consumption", () => {
  const buy=expense({id:'buy',date:at('2026-11-24'),amount:rs(500),categoryId:'dining.dinner'});
  const rows=[buy,income({date:at('2026-11-25'),isRefund:true,reversesTransactionId:buy.id,amount:rs(1000)}),income({date:at('2026-11-25'),description:'Gift',amount:rs(1000),categoryId:'dining.dinner'})];
  const report=spendingPace({...base,transactions:rows,limit:0});
  assert.equal(report.spending,rs(-500));assert.equal(report.points[1]?.actual,rs(-500));assert.equal(report.expected,0);
});

test("the flow agrees with cycle totals, preserves Gold as investment and ignores card repayments", () => {
  const gold=makeInvestment({id:'gold',kind:'GOLD',monthlyContribution:rs(30000)});
  const mf=makeInvestment({id:'mf',kind:'MUTUAL_FUND',monthlyContribution:rs(90000),cycleTargets:{[month]:rs(10000)}});
  const rows=[income({date:at('2026-11-23'),amount:rs(140000)}),expense({date:at('2026-11-25'),categoryId:'dining.dinner',amount:rs(10000),accountId:'card'}),investmentTxn({date:at('2026-11-25'),investmentId:'gold',amount:rs(30000)}),investmentTxn({date:at('2026-11-25'),investmentId:'mf',amount:rs(10000)})];
  const before=JSON.stringify(rows);
  const report=cycleMoneyFlow({...base,transactions:[...rows,transfer({date:at('2026-11-25'),amount:rs(10000),accountId:'bank',toAccountId:'card'})],categories,investments:[gold,mf]});
  balanced(report);assert.equal(report.remaining,rs(90000));
  assert.deepEqual(report.destinations.filter(n=>n.kind==='investment').map(n=>[n.label,n.amount]),[['Gold',rs(30000)],['Mutual funds',rs(10000)]]);
  assert.equal(report.destinations.find(n=>n.kind==='spending')?.amount,rs(10000));
  assert.equal(report.sources.find(n=>n.kind==='income')?.rows[0]?.date,at('2026-11-23'));
  assert.equal(JSON.stringify(rows),before);
});

test("overspending is balanced by a visible gap rather than fabricated income or negative ribbons", () => {
  const report=flow([income({date:at('2026-11-25'),amount:rs(10000)}),expense({date:at('2026-11-25'),amount:rs(15000)}),investmentTxn({date:at('2026-11-25'),amount:rs(3000)})]);
  balanced(report);assert.equal(report.sources.find(n=>n.kind==='gap')?.amount,rs(8000));
  assert.equal(report.totals.income,rs(10000));assert.equal(report.remaining,rs(-8000));
  assert.equal(report.destinations.some(n=>n.kind==='remaining'),false);
});

test("refund-heavy categories become positive refund sources while retaining net spending and dates", () => {
  const original=expense({id:'prior',date:at('2026-10-25'),categoryId:'shopping.clothing',amount:rs(13000)});
  const report=flow([original,income({date:at('2026-11-25'),amount:rs(100000)}),expense({date:at('2026-11-25'),categoryId:'dining.dinner',amount:rs(8000)}),income({date:at('2026-11-26'),amount:rs(13000),isRefund:true,reversesTransactionId:original.id}),investmentTxn({date:at('2026-11-25'),amount:rs(30000)})]);
  balanced(report);assert.equal(report.totals.spent,rs(-5000));assert.equal(report.remaining,rs(75000));
  assert.equal(report.sources.find(n=>n.kind==='refund')?.amount,rs(13000));
  assert.equal(report.sources.find(n=>n.kind==='refund')?.rows[0]?.date,at('2026-11-26'));
});

test("returned principal is separate from income; transfers and reconciliation adjustments stay out", () => {
  const report=flow([transfer({date:at('2026-11-25'),investmentId:'fd',accountId:'fd-account',toAccountId:'bank',amount:rs(50000)}),investmentTxn({date:at('2026-11-25'),amount:rs(30000)}),income({date:at('2026-11-25'),amount:rs(12345),categoryId:'adjustment'}),expense({date:at('2026-11-25'),amount:rs(999),categoryId:'adjustment'}),transfer({date:at('2026-11-25'),accountId:'a',toAccountId:'b',amount:rs(70000)})]);
  balanced(report);assert.equal(report.totals.income,0);assert.equal(report.sources.find(n=>n.kind==='principal')?.amount,rs(50000));assert.equal(report.remaining,rs(20000));
  assert.equal(flow([transfer({date:at('2026-11-25'),amount:rs(70000)})]).total,0);
});

test("linked purchase funding and pass-through rent use the exact personal projection", () => {
  const rows=[income({id:'gift',description:'Wallet funds',date:at('2026-11-24'),amount:rs(2100)}),expense({id:'wallet',date:at('2026-11-25'),amount:rs(2918)}),income({id:'rent',description:'Rent to forward',date:at('2026-11-25'),amount:rs(4500)}),expense({id:'mom',date:at('2026-11-25'),amount:rs(4500)})];
  const links:MoneyLink[]=[{id:'fund',kind:'CONTRIBUTION',incomeId:'gift',expenseId:'wallet',amount:rs(2100),createdAt:at('2026-11-25')},{id:'pass',kind:'PASS_THROUGH',incomeId:'rent',expenseId:'mom',amount:rs(4500),createdAt:at('2026-11-25')}];
  const projected=projectMoneyLinks({transactions:rows,moneyLinks:links},now).transactions;
  const report=flow(projected);balanced(report);assert.equal(report.totals.income,0);assert.equal(report.totals.spent,rs(818));assert.equal(report.total,rs(818));
  assert.equal(spendingPace({...base,transactions:projected,limit:rs(10000)}).spending,rs(818));
});

test("six-cycle history attributes early payroll once, labels incomplete history and retains negative spend", () => {
  const rows=[income({date:at('2026-11-23'),amount:rs(140000)}),income({date:at('2026-10-25'),amount:rs(145000)}),income({date:at('2026-10-26'),isRefund:true,amount:rs(5000)}),expense({date:at('2026-11-25'),amount:rs(1000)})];
  const report=incomeSpendingHistory({...base,transactions:rows});
  assert.equal(report.length,6);assert.equal(report[0]?.month,'2026-06-24');assert.equal(report[0]?.hasRecords,false);
  const prior=report.at(-2)!;assert.equal(prior.income,rs(145000));assert.equal(prior.spent,rs(-5000));assert.equal(prior.partial,false);
  const current=report.at(-1)!;assert.equal(current.income,rs(140000));assert.equal(current.spent,rs(1000));assert.equal(current.partial,true);assert.equal(current.elapsed,3);
  assert.equal(report.reduce((sum,p)=>sum+p.income,0),rs(285000));
});

test("Indian midnight and 31st-payday February stay correct across host timezones", () => {
  const india=spendingPace({...base,now:new Date('2026-11-26T20:00:00Z'),transactions:[expense({date:at('2026-11-27'),amount:rs(1000)}),expense({date:at('2026-11-27',23),timing:{source:'bank',precision:'exact',timezone:'Asia/Kolkata'},amount:rs(9000)})],limit:rs(60000)});
  assert.equal(india.elapsed,4);assert.equal(india.spending,rs(1000));assert.equal(india.points[3]?.actual,rs(1000));
  const feb=spendingPace({month:'2026-02-28',now:new Date('2026-03-10T12:00:00Z'),cycleStartDay:31,transactions:[],limit:rs(31000)});
  assert.equal(feb.days,31);assert.equal(feb.points.at(-1)?.date,'2026-03-30');assert.equal(feb.points.at(-1)?.ideal,rs(31000));
});

test("grouping and ribbon layout conserve exact paise, touch spacing and input state", () => {
  const groups=['dining','transport','shopping','bills','health','gifts','travel'];
  for(let i=0;i<24;i++) {
    const rows=[income({date:at('2026-11-25'),amount:rs(i*1000)}),...groups.map((categoryId,j)=>expense({date:at('2026-11-25'),categoryId,amount:rs((i+1)*(j+1)*75)})),income({date:at('2026-11-26'),isRefund:true,categoryId:'shopping',amount:rs(i*900)})];
    const original=JSON.stringify(rows),report=flow(rows);balanced(report);
    assert.equal(report.totals.spent,monthTotals(rows,month,24).spent);
    const layout=flowLayout(report);
    for(const side of [layout.sources,layout.destinations]){
      assert.ok(Math.abs(side.reduce((sum,n)=>sum+n.band,0)-180)<1e-8);
      for(let j=0;j<side.length;j++){const n=side[j]!;assert.ok(n.block>=52&&n.band>0&&n.bandY>=0&&n.bandY+n.band<=layout.height);if(j>0)assert.ok(n.y>=side[j-1]!.y+side[j-1]!.block);}
    }
    assert.equal(JSON.stringify(rows),original);
  }
});

test("empty and future periods produce no invented flows or future actuals", () => {
  const report=flow([]);assert.equal(report.total,0);assert.equal(report.remaining,0);assert.deepEqual(report.sources,[]);assert.deepEqual(report.destinations,[]);
  const future=spendingPace({...base,month:'2026-12-24',transactions:[],limit:0});assert.equal(future.elapsed,0);assert.ok(future.points.every(p=>p.actual===null&&p.ideal===0));
  assert.ok(Number.isFinite(flowLayout(report).height));
});
