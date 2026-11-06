import test from 'node:test';
import assert from 'node:assert/strict';
import {isSalaryIncome,reportingCycle,salaryTimingAdjustments} from '@/lib/engine/salary-cycle';
import {accountBalance,monthTotals,monthTransactions} from '@/lib/engine/analytics';
import {calculateSafeToSpend} from '@/lib/engine/safe-to-spend';
import {incomeEvidence} from '@/lib/engine/income-evidence';
import {buildAIFacts} from '@/lib/ai/facts';
import {buildCategorySeed} from '@/lib/domain/categories';
import {income,expense,transfer,makeAccount,makeIncomeSource,rs} from '../helpers/factories';
const salary=(date:string,amount=153860)=>income({description:'Salary',merchant:'Salary',date:`${date}T10:00:00`,amount:rs(amount),accountId:'bank'});
test('salary on any day 22–25 belongs once to that month’s 24th cycle',()=>{
 for(const day of [22,23,24,25]){
  const t=salary(`2026-10-${day}`),rows=[t];assert.equal(reportingCycle(t,24),'2026-10-24');
  assert.equal(monthTotals(rows,'2026-09-24',24).income,0);assert.equal(monthTotals(rows,'2026-10-24',24).income,t.amount);assert.equal(monthTotals(rows,'2026-11-24',24).income,0);
  assert.equal(monthTransactions(rows,'2026-10-24',24)[0]!.date,t.date);
 }
});
test('two adjacent monthly salaries inside a date window are assigned to separate salary cycles',()=>{
 const rows=[salary('2026-10-22'),salary('2026-11-22',160000),income({date:'2026-11-03T12:00:00',amount:rs(4500),description:'Friend share'})];
 assert.equal(monthTotals(rows,'2026-10-24',24).income,rs(158360));assert.equal(monthTotals(rows,'2026-11-24',24).income,rs(160000));
 const sum=['2026-09-24','2026-10-24','2026-11-24'].reduce((sum,key)=>sum+monthTotals(rows,key,24).income,0);assert.equal(sum,rs(318360));
 assert.deepEqual(salaryTimingAdjustments(rows,'2026-10-24',24),{receivedBefore:rs(153860),assignedNext:rs(160000),difference:rs(-6140)});
});
test('December/January, date-only values and non-24th windows remain deterministic',()=>{
 assert.equal(reportingCycle(salary('2027-01-22'),24),'2027-01-24');assert.equal(reportingCycle(salary('2026-12-23'),24),'2026-12-24');
 assert.equal(reportingCycle({...salary('2026-10-22'),date:'2026-10-22'},24),'2026-10-24');
 assert.equal(reportingCycle(salary('2026-10-22'),1),'2026-10-01');assert.equal(reportingCycle(salary('2026-10-22'),25),'2026-09-25');
});
test('refunds, adjustments, transfers, loans and personal reimbursements do not become salary',()=>{
 for(const t of [income({description:'Salary',isRefund:true}),income({description:'Salary',categoryId:'adjustment'}),income({description:'SAL OCT 26 LOAN'}),transfer({description:'Salary'}),income({description:'Salary Store'}),income({description:'Example Friend',date:'2026-10-22T00:00:00'})])assert.equal(isSalaryIncome(t),false);
 const friend=income({description:'Friend share',date:'2026-10-22T00:00:00',amount:rs(6000)});assert.equal(monthTotals([friend],'2026-09-24',24).income,rs(6000));
 assert.equal(isSalaryIncome(income({description:'NEFT Cr-ICIC0000104-SAL OCT 26 EXAMPLE EMPLOYER'})),true);
});
test('salary attribution does not fabricate a payment or hide distinct ledger events',()=>{
 assert.equal(monthTotals([salary('2026-10-22')],'2026-11-24',24).income,0);
 const rows=[salary('2026-10-22'),salary('2026-10-24',1000)];assert.equal(monthTotals(rows,'2026-10-24',24).income,rs(154860));
});
test('cash, card position and safe-to-spend remain based on real posting dates',()=>{
 const bank=makeAccount({id:'bank',openingBalance:0}),rows=[salary('2026-10-22'),income({date:'2026-10-27T00:00:00',amount:rs(6000),accountId:'bank',description:'Friend share'}),expense({date:'2026-10-28T00:00:00',amount:rs(1000),accountId:'bank'})];
 const before=structuredClone(rows),safe=calculateSafeToSpend({transactions:rows,accounts:[bank],incomeSources:[makeIncomeSource()],investments:[],recurring:[],goals:[],month:'2026-10-24',cycleStartDay:24,now:new Date('2026-11-06T12:00:00Z')});
 assert.equal(monthTotals(rows,'2026-10-24',24).income,rs(159860));assert.equal(accountBalance(bank,rows),rs(158860));assert.equal(safe.safeAmount,rs(158860));
 assert.equal(safe.monthlySurplus,rs(5000));assert.equal(safe.positionDifference,0);assert.equal(safe.positionNow-safe.positionAtCycleStart,rs(5000));
 assert.equal(safe.monthlySurplusBreakdown.reduce((sum,l)=>sum+(l.direction==='add'?l.amount:-l.amount),0),safe.monthlySurplus);assert.deepEqual(rows,before);
});
test('both early salaries are bridged individually in cash explanations',()=>{
 const rows=[salary('2026-10-22'),salary('2026-11-22',160000)];const safe=calculateSafeToSpend({transactions:rows,accounts:[makeAccount({id:'bank',openingBalance:0})],incomeSources:[],investments:[],recurring:[],goals:[],month:'2026-10-24',cycleStartDay:24,now:new Date('2026-11-23T12:00:00Z')});
 assert.equal(safe.monthlySurplus,rs(160000));assert.equal(safe.positionDifference,0);assert.equal(safe.monthlySurplusBreakdown.find(l=>l.id==='salary-before-cycle')?.amount,rs(153860));assert.equal(safe.monthlySurplusBreakdown.find(l=>l.id==='salary-next-cycle')?.amount,rs(160000));
});
test('income evidence and AI income facts use the same cycle attribution, keeping source dates',()=>{
 const rows=[salary('2026-10-22'),income({date:'2026-10-27T00:00:00',amount:rs(6000),description:'Friend share'})],now=new Date('2026-11-06T12:00:00Z');
 const report=incomeEvidence(rows,'2026-10-24',24,now);assert.equal(report.rows.length,2);assert.equal(report.earlySalary[0]!.date,'2026-10-22T10:00:00');assert.equal(report.salaryBeforeCycle,undefined);
 const context=buildAIFacts({transactions:rows,accounts:[makeAccount({id:'bank'})],categories:buildCategorySeed(),month:'2026-10-24',cycleStartDay:24,now});const fact=context.facts.find(f=>f.id==='income')!;assert.equal(fact.metrics[0]!.value,rs(159860));assert.equal(fact.transactionIds.length,2);
});
