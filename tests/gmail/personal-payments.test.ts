import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticTransfer,personalIncome,possibleSelfPayment,credDebit} from '@/lib/gmail/payment-policy';
import {classifiedAlert} from '@/lib/gmail/classification';
import {parseAlert,automaticReason,type Alert} from '@/lib/gmail/alerts';
import {parseExpenseInput} from '@/lib/engine/parser';
import {incomeEvidence} from '@/lib/engine/income-evidence';
import {expense,income,transfer,rs,makeRule} from '../helpers/factories';
const a=(over:Partial<Alert>={}):Alert=>({bank:'HDFC',instrument:'bank',tail:'1234',amount:600000,date:'2026-11-04',merchant:'Example Person (VPA: ******@bank)',direction:'credit',creditKind:'unknown',paymentRail:'UPI',accountId:'hdfc',reference:'123456789012',...over});
const accounts=[{id:'hdfc',type:'BANK' as const,isActive:true},{id:'axis',type:'BANK' as const,isActive:true},{id:'card',type:'CREDIT_CARD' as const,isActive:true}];
const cats=[{id:'other'},{id:'transport'},{id:'transport.auto'},{id:'dining'},{id:'dining.delivery'},{id:'bills.mobile'},{id:'health.medicine'}];
test('personal repayments are ordinary income even with masked VPA; self and financial events are excluded',()=>{
 assert.equal(personalIncome(a(),['My Own Name']),true);
 assert.equal(personalIncome(a({merchant:'NEFT Cr-UTIB0000123-EXAMPLE FRIEND-INXXXXXXXX1234',paymentRail:'NEFT'}),['My Own Name']),true);
 assert.equal(personalIncome(a({merchant:'NEFT Cr-UTIB0000123-MY OWN NAME-INXXXXXXXX1234',paymentRail:'NEFT'}),['My Own Name']),false);
 for(const over of [{direction:'debit' as const},{instrument:'credit_card' as const},{creditKind:'refund' as const},{creditKind:'repayment' as const},{merchant:'MY OWN NAME (VPA: ***@bank)'},{merchant:'GROWW PAYOUT'},{merchant:'Example Loan'},{merchant:'ZOMATO'},{merchant:'CRED TELECOM'},{merchant:'Example Store'}])assert.equal(personalIncome(a(over),['My Own Name']),false,JSON.stringify(over));
 assert.equal(possibleSelfPayment(a({merchant:'Ajay Singh (VPA: **@bank)'}),['Ajay']),true);
 assert.equal(possibleSelfPayment(a({merchant:'Jay Singh'}),['Ajay']),false);
});
test('own-bank transfer needs the shared reference and both owned endpoints, never the name or amount alone',()=>{
 const credit=a({accountId:'axis',merchant:'My Own Name'}),debit=a({direction:'debit',accountId:'hdfc',creditKind:undefined});
 const evidence=[{messageId:'debit',alert:debit}];
 const plan=automaticTransfer(credit,'credit',evidence,accounts)!;assert.equal(plan.from,'hdfc');assert.equal(plan.to,'axis');assert.equal(plan.basis,'bank-reference');
 for(const over of [{reference:undefined},{reference:'999999999999'},{accountId:'unknown'},{direction:'credit' as const},{amount:123},{date:'2026-10-20'},{creditKind:'refund' as const}])assert.equal(automaticTransfer(credit,'credit',[{messageId:'debit',alert:{...debit,...over}}],accounts),undefined);
 assert.equal(automaticTransfer(credit,'credit',[...evidence,{messageId:'second',alert:debit}],accounts),undefined);
 assert.equal(automaticTransfer(credit,'credit',evidence,accounts.map(x=>x.id==='hdfc'?{...x,isActive:false}:x)),undefined);
});
test('unique CRED debit and successful card receipt route a repayment; equal competing receipts abstain',()=>{
 const debit=a({direction:'debit',merchant:'CRED Club',creditKind:undefined}),card=a({instrument:'credit_card',accountId:'card',direction:'credit',creditKind:'repayment',reference:undefined,providerReference:'CRED:ORDER123456',merchant:'HSBC card repayment via CRED'});
 const plan=automaticTransfer(debit,'bank',[{messageId:'card',alert:card}],accounts)!;assert.equal(plan.from,'hdfc');assert.equal(plan.to,'card');assert.equal(plan.basis,'cred-payment');
 assert.equal(automaticTransfer(debit,'bank',[{messageId:'card',alert:{...card,date:'2026-11-05'}}],accounts),undefined);
 assert.equal(automaticTransfer(debit,'bank',[{messageId:'card',alert:card},{messageId:'card2',alert:card}],accounts),undefined);
 assert.equal(automaticTransfer(card,'card',[{messageId:'bank',alert:debit},{messageId:'bank2',alert:debit}],accounts),undefined);
 assert.equal(automaticTransfer(debit,'bank',[{messageId:'card',alert:card},{messageId:'bank2',alert:debit}],accounts),undefined);
 assert.equal(credDebit({...debit,merchant:'CRED TELECOM'}),false);
});
test('small-expense preference applies below 100 to masked payees and generic entries but preserves known merchants and income',()=>{
 for(const merchant of ['Example Person (VPA: ********@okbank)','Another Person','UPI/P2M/123456789012/Another Person']){
  const result=classifiedAlert(a({merchant,direction:'debit',amount:9999,creditKind:undefined}),[],cats);
  assert.equal(result.categoryId,'transport.auto',merchant);assert.equal(result.classification?.needsReview,false);
 }
 assert.equal(classifiedAlert(a({direction:'debit',merchant:'Another Person',amount:10000}),[],cats).categoryId,'other');
 assert.equal(classifiedAlert(a({direction:'debit',merchant:'ZOMATO LTD',amount:8000}),[],cats).categoryId,'dining.delivery');
 assert.equal(classifiedAlert(a({direction:'debit',merchant:'Example Pharmacy',amount:5000}),[],cats).categoryId,'health.medicine');
 assert.equal(parseExpenseInput('58 Example Person').categoryId,'transport.auto');
 assert.equal(parseExpenseInput('100 Example Person').categoryId,'other');
 const sms='Sent Rs.58.00\nFrom HDFC Bank A/C *1234\nTo Example Person\nOn 04/11/26\nRef 123456789012';
 assert.equal(parseExpenseInput(sms).categoryId,'transport.auto');
 assert.notEqual(parseExpenseInput(sms.replace('Sent','Received')).categoryId,'transport.auto');
 assert.equal(parseExpenseInput('58 Zomato').categoryId.startsWith('dining'),true);
 assert.equal(parseExpenseInput('income 58 Example Person').type,'INCOME');
 const weak=makeRule({pattern:'example',categoryId:'other',confidence:0.6});
 assert.equal(classifiedAlert(a({merchant:'Example Person',direction:'debit',amount:5800}),[weak],cats).categoryId,'transport.auto');
 assert.equal(parseExpenseInput('58 Example Person',{rules:[weak]}).categoryId,'transport.auto');
 const surname=makeRule({pattern:'person',merchant:'Person',categoryId:'dining.snacks',confidence:0.6});
 assert.equal(classifiedAlert(a({merchant:'Another Person',direction:'debit',amount:5800}),[surname],cats).categoryId,'transport.auto');
 const explicit={...weak,learningEvidence:{source:'gmail-correction' as const,merchantKey:'example person',support:1,exampleIds:[]}};
 assert.equal(classifiedAlert(a({merchant:'Example Person',direction:'debit',amount:5800}),[explicit],cats).categoryId,'other');
});
test('CRED Telecom is an ordinary mobile expense, not a card repayment or personal income',()=>{
 const body='Rs.647.82 is debited from your HDFC Bank account ending 1234 towards CRED TELECOM on 01-11-2026. UPI transaction reference no.: 123456789012';
 const parsed=parseAlert('alerts@hdfcbank.bank.in','Account debit',body)!;
 assert.equal(parsed.special,false);const result=classifiedAlert({...parsed,accountId:'hdfc'},[],cats);
 assert.equal(result.categoryId,'bills.mobile');assert.equal(automaticReason(result,true,'2026-09-01'),null);
 assert.equal(parseExpenseInput('647.82 CRED TELECOM').categoryId,'bills.mobile');
});
test('income evidence keeps salary before payday outside the cycle without removing it from the ledger',()=>{
 const rows=[income({date:'2026-10-22',description:'Salary',amount:rs(153860)}),income({date:'2026-10-27',description:'Friend share',amount:rs(6000)}),income({date:'2026-11-01',amount:rs(500),isRefund:true}),transfer({date:'2026-11-04',amount:rs(30000)}),expense({date:'2026-11-04',amount:rs(500)})];
 const before=structuredClone(rows),report=incomeEvidence(rows,'2026-10-24',24,new Date('2026-11-06T12:00:00Z'));
 assert.equal(report.rows.length,1);assert.equal(report.rows[0]!.amount,rs(6000));assert.equal(report.salaryBeforeCycle?.amount,rs(153860));assert.deepEqual(rows,before);
 const previous=incomeEvidence(rows,'2026-09-24',24,new Date('2026-11-06T12:00:00Z'));assert.equal(previous.rows.some(t=>t.description==='Salary'),true);assert.equal(previous.salaryBeforeCycle,undefined);
});
