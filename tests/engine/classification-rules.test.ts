import test from 'node:test';
import assert from 'node:assert/strict';
import {classifiedAlert,historicalRules} from '@/lib/gmail/classification';
import {parseExpenseInput,canQuickSave} from '@/lib/engine/parser';
import {classificationMerchantKey,merchantKey} from '@/lib/engine/merchant-identity';
import {learnFromEntry} from '@/lib/engine/learning';
import {buildCategorySeed} from '@/lib/domain/categories';
import {makeRule,expense} from '../helpers/factories';
import type {Alert} from '@/lib/gmail/alerts';
import {MERCHANTS} from '@/lib/engine/lexicon';
const cats=buildCategorySeed();
const a=(merchant:string):Alert=>({bank:'HDFC',instrument:'bank',tail:'7900',merchant,amount:41594,date:'2026-10-30',direction:'debit'});
const classify=(merchant:string,rules:ReturnType<typeof makeRule>[])=>classifiedAlert(a(merchant),rules,cats);

test('weak legacy dining guesses cannot block clear merchant recognition in either entry path',()=>{
 for(const [merchant,categoryId,expected] of [['ZOMATO LTD','dining.dinner','dining.delivery'],['Swiggy Limited','dining.other','dining.delivery'],['SWIGGY INSTAMART','dining.other','dining.groceries'],['Nykaa Fashion','shopping.personal','shopping.clothing']]){
  const rules=[makeRule({pattern:merchant!.split(' ')[0]!.toLowerCase(),categoryId,confidence:0.6})];
  assert.equal(classify(merchant!,rules).categoryId,expected,merchant);
  assert.equal(parseExpenseInput(`415.94 ${merchant}`,{rules}).categoryId,expected,merchant);
 }
 const scoped=makeRule({pattern:'zomato',categoryId:'dining.coffee',confidence:0.6,learningEvidence:{source:'manual-correction',merchantKey:'zomato',exampleIds:[],support:1}});
 assert.equal(classify('Zomato',[scoped]).categoryId,'dining.coffee');
 assert.equal(parseExpenseInput('416 Zomato',{rules:[scoped]}).categoryId,'dining.coffee');
});

test('equally specific saved conflicts cannot be silently resolved by rule order or confidence',()=>{
 const one=makeRule({pattern:'zomato',categoryId:'dining',confidence:0.98});
 const two=makeRule({pattern:'zomato',categoryId:'gifts',confidence:0.9});
 for(const rules of [[one,two],[two,one]]){
  assert.equal(classify('Zomato',rules).categoryId,'other');
  const manual=parseExpenseInput('416 Zomato',{rules});
  assert.equal(manual.categoryId,'other');assert.equal(canQuickSave(manual),false);
 }
 const specific=makeRule({pattern:'amazon prime',categoryId:'bills.subscription',confidence:0.98});
 const broad=makeRule({pattern:'amazon',categoryId:'shopping',confidence:0.98});
 assert.equal(classify('Amazon Prime Membership',[broad,specific]).categoryId,'bills.subscription');
 assert.equal(parseExpenseInput('416 Amazon Prime Membership',{rules:[broad,specific]}).categoryId,'bills.subscription');
});

test('explicit corrected leaves and approved time rules survive meal clocks in both paths',()=>{
 const time='2026-10-30T13:00:00';
 for(const rule of [makeRule({pattern:'zomato',categoryId:'dining.dinner',confidence:0.95,learningEvidence:{source:'manual-correction',merchantKey:'zomato',exampleIds:[],support:1}}),makeRule({pattern:'zomato',categoryId:'dining.dinner',confidence:0.95,conditions:{merchantKey:'zomato',startHour:12,endHour:16,weekdays:[5]}})]){
  assert.equal(classifiedAlert({...a('Zomato'),occurredAt:time,timeSource:'bank',timeConfidence:'exact'},[rule],cats).categoryId,'dining.dinner');
  assert.equal(parseExpenseInput('416 Zomato lunch',{rules:[rule],actualTime:time}).categoryId,'dining.dinner');
 }
});

test('classification scopes keep sub-brands separate without changing financial merchant keys',()=>{
 assert.equal(merchantKey('Amazon Prime Membership'),'amazon'); // Existing financial identity stays unchanged.
 assert.notEqual(classificationMerchantKey('Amazon'),classificationMerchantKey('Amazon Prime Membership'));
 assert.notEqual(classificationMerchantKey('Nykaa'),classificationMerchantKey('Nykaa Fashion'));
 assert.equal(classificationMerchantKey('Swiggy Instamart Private Limited'),'instamart');
 const shopping=makeRule({pattern:'amazon',categoryId:'gifts',confidence:0.95,learningEvidence:{source:'manual-correction',merchantKey:'amazon',exampleIds:[],support:1}});
 assert.equal(classify('Amazon',[shopping]).categoryId,'gifts');
 assert.equal(classify('Amazon Prime Membership',[shopping]).categoryId,'bills.subscription');
 const groceries=makeRule({pattern:'swiggy',categoryId:'dining.groceries',confidence:0.95,learningEvidence:{source:'manual-correction',merchantKey:'swiggy instamart',exampleIds:[],support:1}});
 assert.equal(classify('SWIGGY INSTAMART PRIVATE LIMITED',[groceries]).categoryId,'dining.groceries','Old full sub-brand keys remain readable');
 assert.equal(classify('Swiggy',[groceries]).categoryId,'dining.delivery');
});

test('a broad saved rule cannot rename a different known sub-brand through its merchant alias',()=>{
 const rule=makeRule({pattern:'swiggy',categoryId:'dining',confidence:0.95,merchant:'SWIGGY INSTAMART PRIVATE LIMITED'});
 assert.equal(classify('Swiggy Limited',[rule]).merchant,'Swiggy Limited');
 assert.equal(parseExpenseInput('416 Swiggy Limited',{rules:[rule]}).merchant,'Swiggy');
 const alias=makeRule({pattern:'eternal',categoryId:'dining',confidence:0.95,merchant:'Zomato'});
 assert.equal(classify('ETERNAL LIM',[alias]).merchant,'Zomato','Genuine saved aliases still work');
});

test('a new manual category correction carries explicit merchant evidence immediately',()=>{
 const [rule]=learnFromEntry({description:'Nykaa Fashion',merchant:'Nykaa Fashion',categoryId:'shopping.clothing',contexts:[],wasCorrected:true},[]);
 assert.equal(rule!.learningEvidence?.source,'manual-correction');
 assert.equal(rule!.learningEvidence?.merchantKey,'nykaa fashion');
 assert.equal(classify('Nykaa Fashion',[rule!]).classification?.needsReview,false);
 assert.equal(canQuickSave(parseExpenseInput('416 Nykaa Fashion',{rules:[rule!]})),true);
 const generic=makeRule({pattern:'driver',categoryId:'transport.cab',confidence:0.95});
 const [personal]=learnFromEntry({description:'Example Driver',merchant:'Example Driver',categoryId:'gifts',contexts:[],wasCorrected:true},[generic]);
 assert.notEqual(personal!.id,generic.id,'One payee correction preserves the generic rule');
 assert.equal(generic.categoryId,'transport.cab');
 assert.equal(classify('Example Driver',[generic,personal!]).categoryId,'gifts');
 assert.equal(classify('Another Driver',[generic,personal!]).categoryId,'transport.cab');
});

test('missing merchant leaf falls back to an available parent, never a different family',()=>{
 const partial=cats.filter(c=>c.id!=='health.medicine');
 assert.equal(classifiedAlert(a('Apollo Pharmacy'),[],partial).categoryId,'health');
 assert.equal(classifiedAlert(a('Apollo Pharmacy'),[],[{id:'other'}]).classification?.needsReview,true);
});

test('refunds, zero values and negative adjustments cannot seed historical merchant rules',()=>{
 for(const invalid of [{amount:0},{amount:-100},{isRefund:true},{reversesTransactionId:'purchase'}]){
  const rows=Array.from({length:3},()=>expense({merchant:'Example Grocer',categoryId:'essentials',...invalid}));
  assert.deepEqual(historicalRules(rows,[]),{rules:[],conflicts:[]});
 }
});

test('all built-in merchant display names classify to their intended family in both paths',()=>{
 for(const merchant of MERCHANTS){
  const expected=merchant.categoryId.split('.')[0];
  assert.equal(classify(merchant.name,[]).categoryId?.split('.')[0],expected,`${merchant.name} Gmail`);
  assert.equal(parseExpenseInput(`416 ${merchant.name}`).categoryId.split('.')[0],expected,`${merchant.name} quick entry`);
 }
 assert.equal(classify('Amazon Fresh',[]).categoryId,'essentials');
 assert.equal(parseExpenseInput('416 Indian Oil').categoryId,'transport.fuel');
 assert.equal(parseExpenseInput('416 oil').categoryId,'essentials','Real grocery wording is preserved');
});
