import assert from 'node:assert/strict';
import test from 'node:test';
import {createEmptyDatabase} from '@/lib/data/seed';
import {moneyNotifications,liveNotificationCycle} from '@/lib/notifications/rules';
import {DEFAULT_NOTIFICATION_PREFERENCES as defaults,inQuietHours,moneyPushNotice,notificationDestination,notificationKey,pushEligible,validNotificationKey,validNotificationPreferences} from '@/lib/notifications/model';
import {at,expense,income,investmentTxn,makeCard,makeCardDetail,makeIncomeSource,makeRecurring,rs,transfer} from '../helpers/factories';
const now=new Date('2026-11-27T08:00:00Z');
const prefs={...defaults,weeklyRecap:false};
function database(){const db=createEmptyDatabase();db.transactions=[];db.recurring=[];db.accounts=[];db.incomeSources=[makeIncomeSource()];return db;}
const bill=()=>makeRecurring({id:'youtube',description:'YouTube Premium',categoryId:'bills.subscriptions',dayOfPeriod:28,accountId:'hdfc',amount:rs(195)});

test('unpaid schedules are estimates; confirmed links and recognised charges clear them without mutating the ledger',()=>{
 const db=database();db.recurring=[bill()];
 const alerts=moneyNotifications(db,now,prefs);assert.equal(alerts.length,1);assert.equal(alerts[0]?.date,'2026-11-28');assert.equal(alerts[0]?.estimated,true);assert.match(alerts[0]!.title,/tomorrow/);
 db.transactions=[expense({date:at('2026-11-26'),accountId:'hdfc',categoryId:'bills.subscriptions',description:'YouTube Premium',amount:rs(195)})];
 const before=JSON.stringify(db);assert.equal(moneyNotifications(db,now,prefs).length,0);assert.equal(JSON.stringify(db),before);
 db.transactions[0]={...db.transactions[0]!,amount:rs(220),description:'APPLE MEDIA SERVICES',recurringId:'youtube'};
 assert.equal(moneyNotifications(db,now,prefs).length,0);
});
test('processor labels, changed amounts, duplicate schedules and refunded payments ask for review, never another payment',()=>{
 for(const mode of ['apple','changed','overlap','refund']){
  const db=database();db.recurring=[bill()];
  db.transactions=[expense({id:'charge',date:at('2026-11-26'),accountId:'hdfc',categoryId:'bills.subscriptions',description:mode==='apple'?'APPLE MEDIA SERVICES':'YouTube Premium',amount:rs(mode==='changed'?200:195),...(mode==='refund'?{recurringId:'youtube'}:{})})];
  if(mode==='overlap')db.recurring.push({...bill(),id:'duplicate'});
  if(mode==='refund')db.transactions.push(income({date:at('2026-11-27'),amount:rs(195),isRefund:true,reversesTransactionId:'charge'}));
  const alerts=moneyNotifications(db,now,prefs).filter(a=>a.kind==='bill');
  assert.ok(alerts.length>0,mode);assert.ok(alerts.every(a=>a.title.startsWith('Review ')),mode);assert.ok(alerts.every(a=>a.transactionIds.includes('charge')),mode);
 }
});
test('out-of-window and inactive bills never create reminders; due stages produce stable keys',()=>{
 const db=database();db.recurring=[bill(),makeRecurring({dayOfPeriod:10}),{...bill(),id:'inactive',isActive:false}];
 const alert=moneyNotifications(db,now,prefs)[0]!;
 assert.equal(moneyNotifications(db,now,prefs).length,1);
 assert.equal(moneyNotifications(db,new Date('2026-11-27T09:00:00Z'),prefs)[0]?.key,alert.key);
 const today=moneyNotifications(db,new Date('2026-11-28T09:00:00Z'),prefs)[0]!;assert.notEqual(today.key,alert.key);assert.match(today.title,/today/);
});
test('card reminders use the statement remainder, never unbilled total; partial and full repayments count once',()=>{
 const db=database(),card=makeCard({id:'card'});db.accounts=[card];
 db.creditCards=[makeCardDetail({accountId:'card',statementDay:13,dueDay:28,reportedStatement:{issuedOn:'2026-11-13',dueOn:'2026-11-28',amount:rs(1959),source:'Issuer app',recordedAt:'2026-11-19T00:00:00Z'}})];
 db.transactions=[expense({date:at('2026-11-06'),accountId:'card',amount:rs(1959)}),expense({date:at('2026-11-26'),accountId:'card',amount:rs(20000)}),transfer({date:at('2026-11-20'),toAccountId:'card',amount:rs(500)})];
 const alerts=moneyNotifications(db,now,{...prefs,budgets:false});assert.equal(alerts.length,1);assert.equal(alerts[0]?.amount,rs(1459));assert.equal(alerts[0]?.estimated,false);assert.match(alerts[0]!.body,/Issuer statement/);
 db.transactions.push(transfer({date:at('2026-11-27'),toAccountId:'card',amount:rs(1459)}));assert.equal(moneyNotifications(db,now,{...prefs,budgets:false}).length,0);
 db.creditCards[0]!.reportedStatement=undefined;db.transactions=db.transactions.slice(0,2);assert.equal(moneyNotifications(db,now,{...prefs,budgets:false})[0]?.estimated,true);
});
test('budget 80% warning requires spending ahead of pace; exhausted limits persist until resolved',()=>{
 const db=database();db.transactions=[expense({date:at('2026-11-25'),categoryId:'dining.dinner',amount:rs(18000)})];
 let alerts=moneyNotifications(db,now,prefs);assert.equal(alerts.filter(a=>a.kind==='budget').length,1);assert.match(alerts[0]!.key,/:80$/);
 alerts=moneyNotifications(db,new Date('2026-12-22T08:00:00Z'),prefs);assert.equal(alerts.filter(a=>a.kind==='budget').length,0);
 db.transactions[0]!.amount=rs(22000);alerts=moneyNotifications(db,new Date('2026-12-22T08:00:00Z'),prefs);assert.match(alerts[0]!.key,/:100$/);assert.match(alerts[0]!.body,/No allowance/);
 db.transactions.push(income({date:at('2026-11-26'),amount:rs(22000),isRefund:true,reversesTransactionId:db.transactions[0]!.id}));assert.equal(moneyNotifications(db,now,prefs).length,0);
});
test('linked gifts, repayments, pass-through money and reimbursements do not inflate budget alerts',()=>{
 const db=database();const plan={effectiveFrom:'0000-01-01',salary:rs(140000),investment:rs(70000),emergency:rs(10000),buckets:[{id:'shopping',label:'Shopping',limit:rs(1000),categoryIds:['shopping']},{id:'food',label:'Food',limit:rs(3000),categoryIds:['dining']},{id:'family',label:'Family',limit:rs(1000),categoryIds:['family']}]};db.profile.budgetPlans=[plan];
 db.transactions=[income({id:'gift',date:at('2026-11-25'),amount:rs(2100)}),expense({id:'wallet',date:at('2026-11-25'),amount:rs(2918),categoryId:'shopping.clothing'}),income({id:'rent',date:at('2026-11-25'),amount:rs(4500)}),expense({id:'mom',date:at('2026-11-25'),amount:rs(4500),categoryId:'family'}),expense({id:'dinner',date:at('2026-11-25'),amount:rs(10000),categoryId:'dining.dinner'}),income({id:'friends',date:at('2026-11-26'),amount:rs(8000)}),transfer({date:at('2026-11-26'),amount:rs(50000)})];
 db.moneyLinks=[{id:'a',kind:'CONTRIBUTION',incomeId:'gift',expenseId:'wallet',amount:rs(2100),createdAt:at('2026-11-25')},{id:'b',kind:'PASS_THROUGH',incomeId:'rent',expenseId:'mom',amount:rs(4500),createdAt:at('2026-11-25')},{id:'c',kind:'CONTRIBUTION',incomeId:'friends',expenseId:'dinner',amount:rs(8000),createdAt:at('2026-11-26')}];
 const alerts=moneyNotifications(db,now,prefs);assert.equal(alerts.length,1);assert.equal(alerts[0]?.amount,rs(818));assert.match(alerts[0]!.title,/Shopping/);
});
test('live salary cycle and actual Indian clocks hold across host timezones, including midnight',()=>{
 const db=database();db.transactions=[expense({date:at('2026-11-23'),amount:rs(50000),categoryId:'dining.dinner'}),expense({date:at('2026-11-24'),amount:rs(23000),categoryId:'dining.dinner'}),expense({date:at('2026-11-27',23),amount:rs(50000),categoryId:'shopping.clothing',timing:{source:'bank',precision:'exact',timezone:'Asia/Kolkata'}})];
 assert.equal(liveNotificationCycle(db,now).cycle,'2026-11-24');
 const alert=moneyNotifications(db,now,prefs)[0]!;assert.equal(alert.amount,rs(23000));assert.match(alert.key,/2026-11-24/);
 const next=moneyNotifications(db,new Date('2026-11-27T18:40:00Z'),prefs);assert.ok(next.some(a=>a.amount===rs(50000)));
 db.recurring=[makeRecurring({id:'midnight',dayOfPeriod:28,description:'Internet',amount:rs(100),categoryId:'bills'})];assert.ok(moneyNotifications(db,new Date('2026-11-27T18:40:00Z'),prefs).some(a=>a.kind==='bill'&&a.title.includes('today')));
});
test('weekly recap covers the last completed Monday–Sunday, nets linked reimbursements and keeps gold as investment',()=>{
 const db=database();db.transactions=[expense({date:at('2026-11-16'),amount:rs(1000),categoryId:'dining.dinner'}),investmentTxn({date:at('2026-11-22'),amount:rs(30000)}),expense({date:at('2026-11-23'),amount:rs(9000),categoryId:'dining.dinner'})];
 const recap=moneyNotifications(db,now,defaults).find(a=>a.kind==='recap')!;assert.ok(recap);assert.equal(recap.date,'2026-11-16');assert.equal(recap.transactionIds.length,2);assert.equal(recap.amount,rs(1000));assert.match(recap.body,/30,000/);
 assert.equal(moneyNotifications(database(),now,defaults).length,0);
});
test('preferences govern all categories and quiet hours honor midnight in IST',()=>{
 const db=database();db.recurring=[bill()];assert.equal(moneyNotifications(db,now,{...prefs,bills:false,syncIssues:false},{state:'failed'}).length,0);
 assert.ok(validNotificationPreferences(defaults));assert.equal(validNotificationPreferences({...defaults,quietEnd:21}),false);assert.equal(validNotificationPreferences({...defaults,quietEnd:2.5}),false);assert.equal(validNotificationPreferences({...defaults,extra:true}),false);
 for(const clock of ['2026-11-27T15:30:00Z','2026-11-27T18:31:00Z','2026-11-28T03:29:00Z'])assert.equal(inQuietHours(defaults,new Date(clock)),true);
 assert.equal(inQuietHours(defaults,new Date('2026-11-28T03:30:00Z')),false);assert.equal(inQuietHours({...defaults,quietHours:false},now),false);
 assert.equal(inQuietHours({...defaults,quietStart:10,quietEnd:14},now),true);
});
test('generic pushes conceal financial details, allow only app destinations and skip read/dismissed/sent alerts',()=>{
 const db=database();db.recurring=[bill()];const alerts=moneyNotifications(db,now,prefs),first=alerts[0]!;
 const payload=moneyPushNotice(alerts,defaults,'2026-11-27','money');assert.doesNotMatch(JSON.stringify(payload),/YouTube|195|₹/);assert.equal(payload.url,'/money#bills');
 assert.match(moneyPushNotice(alerts,{...defaults,showDetails:true},'2026-11-27','money').body,/195/);
 for(const key of ['readAt','dismissedAt','pushedAt'])assert.equal(pushEligible(alerts,{[first.key]:{key:first.key,readAt:null,dismissedAt:null,pushedAt:null,updatedAt:'now',[key]:'now'}},prefs).length,0);
 assert.equal(pushEligible(alerts,{}, {...prefs,moneyPush:false}).length,0);
 for(const bad of ['https://evil.example','//evil.example','javascript:alert(1)','/settings#evil','/money?token=secret'])assert.equal(notificationDestination(bad),'/notifications');
 for(const good of ['/money#bills','/money#cards','/budgets','/settings#gmail'])assert.equal(notificationDestination(good),good);
 assert.ok(validNotificationKey(notificationKey('bill','a space','2026-11-27')));assert.equal(validNotificationKey('evil:abc'),false);
});
