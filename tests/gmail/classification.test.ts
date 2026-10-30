import assert from "node:assert/strict";
import test from "node:test";
import {suggestCategory,historicalRules,correctedRule,classifiedAlert} from "@/lib/gmail/classification";
import {parseExpenseInput} from "@/lib/engine/parser";
import type {Alert} from "@/lib/gmail/alerts";
import type {ClassificationRule} from "@/lib/domain/types";
import {expense} from "../helpers/factories";
const categories=['other','dining','dining.breakfast','dining.lunch','dining.snacks','dining.dinner','transport','transport.auto','transport.cab','gifts','essentials'].map(id=>({id}));
const alert=(over:Partial<Alert>={}):Alert=>({bank:'HDFC',instrument:'bank',tail:'1234',amount:15000,date:'2026-10-18',merchant:'Zomato',direction:'debit',...over});
const rule=(over:Partial<ClassificationRule>={}):ClassificationRule=>({id:'saved',pattern:'zomato',categoryId:'gifts',contexts:[],confidence:0.95,timesApplied:5,createdAt:'2026-10-01',updatedAt:'2026-10-01',...over});
test('UPI routing banks do not imply mobile recharges, while real telecom payees still match',()=>{
 const cats=[...categories,{id:'bills.mobile'}];
 for(const bank of ['AIRTEL PAY','JIO PAYMEN']){
  const merchant=`UPI/Example Person/example@upi/UPI/${bank}/123456789012`;
  const suggestion=suggestCategory(alert({merchant}),[],cats);
  assert.equal(suggestion.needsReview,true);assert.equal(suggestion.categoryId,'other');
  assert.equal(suggestCategory(alert({merchant}),[rule({pattern:'airtel',categoryId:'bills.mobile'})],cats).categoryId,'other');
 }
 assert.equal(suggestCategory(alert({merchant:'UPI/Airtel/example@upi/UPI/OTHER BANK/123456789012'}),[],cats).categoryId,'bills.mobile');
});
test('confident saved aliases normalize new Gmail observations without changing financial identity',()=>{
 const a=alert({merchant:'ETERNAL LIM',reference:'123456789012',occurredAt:'2026-10-18T13:00:00',timeSource:'bank'});
 const rules=[rule({pattern:'eternal',categoryId:'dining',merchant:'Zomato',confidence:1})];
 const result=classifiedAlert(a,rules,categories);
 assert.equal(result.merchant,'Zomato');assert.equal(result.categoryId,'dining');
 for(const k of ['amount','direction','bank','instrument','tail','date','reference','occurredAt','timeSource'] as const)assert.equal(result[k],a[k]);
 assert.equal(a.merchant,'ETERNAL LIM');
 assert.equal(classifiedAlert(a,[{...rules[0]!,confidence:0.6}],categories).merchant,'ETERNAL LIM');
 assert.equal(classifiedAlert({...a,direction:'credit'},rules,categories).merchant,'ETERNAL LIM');
 assert.equal(classifiedAlert({...a,merchant:'SWIGGY INSTAMART PRIVATE LIMITED'},[rule({pattern:'swiggy',categoryId:'dining',merchant:'Swiggy',confidence:1})],categories).merchant,'SWIGGY INSTAMART PRIVATE LIMITED');
 assert.equal(parseExpenseInput('eternal 250',{rules}).merchant,'Zomato');
});
test('explicit saved mapping outranks food clocks and personal-UPI heuristics',()=>{
 assert.equal(suggestCategory(alert({occurredAt:'2026-10-18T13:00:00',timeSource:'bank'}),[rule()],categories).categoryId,'gifts');
 assert.equal(suggestCategory(alert({merchant:'Example Driver',paymentRail:'UPI',vpa:'driver@bank'}),[rule({pattern:'driver',categoryId:'gifts'})],categories).categoryId,'gifts');
});
test('all requested IST meal boundaries use reliable time; delayed email is only a suggestion',()=>{
 for(const [time,leaf] of [['00:00:00','breakfast'],['11:59:59','breakfast'],['12:00:00','lunch'],['15:59:59','lunch'],['16:00:00','snacks'],['16:59:59','snacks'],['17:00:00','snacks'],['19:59:59','snacks'],['20:00:00','dinner'],['23:59:59','dinner']])assert.equal(suggestCategory(alert({occurredAt:`2026-10-18T${time}`,timeSource:'bank',timeConfidence:'exact'}),[],categories).categoryId,`dining.${leaf}`);
 assert.equal(suggestCategory(alert(),[],categories).categoryId,'dining');
 assert.equal(suggestCategory(alert({occurredAt:'2026-10-18T00:00:00',timeSource:'unknown'}),[],categories).categoryId,'dining');
 assert.equal(suggestCategory(alert({occurredAt:'2026-10-18T13:00:00',timeSource:'gmail',timeConfidence:'fallback'}),[],categories).categoryId,'dining');
 assert.notEqual(suggestCategory(alert({merchant:'Uber',occurredAt:'2026-10-18T13:00:00',timeSource:'bank'}),[],categories).source,'meal');
});
test('personal outgoing UPI strictly below 150 uses Auto after saved mappings and merchant evidence',()=>{
 const a=alert({merchant:'Example Person',paymentRail:'UPI',vpa:'person@bank',amount:14999});
 assert.equal(suggestCategory(a,[],categories).categoryId,'transport.auto');
 for(const over of [{direction:'credit' as const},{amount:15000},{amount:19999},{amount:0},{special:true},{merchant:'Example Store'},{merchant:'Self Person'},{vpa:'***@bank'},{vpa:undefined},{upiRecipientKind:'merchant' as const}])assert.notEqual(suggestCategory({...a,...over},[],categories,['Self Person']).source,'small-upi');
 assert.equal(suggestCategory({...a,merchant:'Zomato'},[],categories).categoryId,'dining');
 assert.notEqual(suggestCategory({...a,direction:'credit',creditKind:'refund'},[],categories).source,'small-upi');
 assert.equal(suggestCategory(a,[rule({pattern:'example',categoryId:'gifts'})],categories).categoryId,'gifts');
 assert.equal(suggestCategory({...a,vpa:undefined,upiRecipientKind:'person'},[],categories).categoryId,'transport.auto');
 const custom=[{id:'transport',name:'Transport'},{id:'my-auto',name:'Auto / Cab',parentId:'transport'},{id:'other',name:'Other'}];
 assert.equal(suggestCategory(a,[],custom).categoryId,'my-auto');
 assert.equal(suggestCategory(a,[],categories.filter(c=>c.id!=='transport.auto')).needsReview,true);
 assert.equal(suggestCategory(a,[],[...custom,{id:'other-auto',name:'Auto',parentId:'transport'}]).needsReview,true);
});
test('conflicting patterns abstain and fresh weak rules remain reviewable',()=>{
 assert.equal(suggestCategory(alert(),[rule(),rule({id:'second',categoryId:'dining'})],categories).source,'unknown');
 assert.equal(suggestCategory(alert(),[rule({confidence:0.6})],categories).needsReview,true);
});
test('history needs three consistent examples and does not rewrite or duplicate saved patterns',()=>{
 const rows=[expense({description:'Example Grocer',merchant:'Example Grocer',categoryId:'essentials'}),expense({description:'Example Grocer',merchant:'Example Grocer',categoryId:'essentials'}),expense({description:'Example Grocer',merchant:'Example Grocer',categoryId:'essentials'})];
 const learned=historicalRules(rows,[]);assert.equal(learned.rules.length,1);assert.equal(learned.rules[0]!.learningEvidence!.support,3);
 assert.equal(historicalRules(rows,[learned.rules[0]!]).rules.length,0);
 assert.equal(historicalRules([...rows,expense({merchant:'Example Grocer',categoryId:'gifts'})],[]).conflicts.length,1);
 assert.equal(suggestCategory(alert({merchant:'Different Grocer'}),learned.rules,categories).source,'unknown');
 assert.notEqual(parseExpenseInput('Different Grocer',{rules:learned.rules}).matchedRuleId,learned.rules[0]!.id);
});
test('future user correction creates a scoped explicit mapping while preserving generic rules',()=>{
 const generic=rule({pattern:'driver',categoryId:'transport.cab'});
 const change=correctedRule(alert({merchant:'Example Driver'}),'gifts',[generic])!;
 assert.equal(change.before,null);assert.equal(generic.categoryId,'transport.cab');
 assert.equal(suggestCategory(alert({merchant:'Example Driver'}),[generic,change.after],categories).categoryId,'gifts');
 assert.equal(suggestCategory(alert({merchant:'Other Driver'}),[generic,change.after],categories).categoryId,'transport.cab');
});

test('mixed Zomato dining leaves do not block food recognition on the next Gmail debit',()=>{
 const cats=[...categories,...['dining.delivery','dining.coffee','dining.other','dining.drinks'].map(id=>({id}))];
 for(const merchant of ['ZOMATO LTD','Swiggy Limited','SWIGGY INSTAMART PRIVATE LIMITED','Zepto']){
  const rows=['dining.breakfast','dining.dinner','dining.coffee','dining.delivery','dining.other','dining.drinks'].map(categoryId=>expense({merchant,categoryId}));
  const legacy=rule({pattern:merchant.startsWith('ZOMATO')?'zomato':'swiggy',categoryId:'dining.dinner',confidence:0.6});
  const trained=historicalRules(rows,[legacy]);
  assert.deepEqual(trained.conflicts,[]);
  assert.deepEqual(trained.rules,[]); // Never select an arbitrary historical leaf.
  const result=classifiedAlert(alert({merchant,amount:41594,occurredAt:'2026-10-30T20:32:34',date:'2026-10-30',timeSource:'gmail',timeConfidence:'fallback'}),[legacy],[...cats,{id:'dining.groceries'}],[],trained.conflicts);
  assert.equal(result.categoryId,/instamart|zepto/i.test(merchant)?'dining.groceries':'dining.delivery');
  assert.equal(result.classification?.needsReview,false);
  assert.equal(result.amount,41594);
  assert.deepEqual(rows.map(t=>t.categoryId),['dining.breakfast','dining.dinner','dining.coffee','dining.delivery','dining.other','dining.drinks']);
 }
});

test('mixed dining history preserves explicit corrections and real cross-family conflicts',()=>{
 const cats=[...categories,{id:'dining.delivery'},{id:'dining.coffee'}];
 const rows=['dining.coffee','dining.delivery'].map(categoryId=>expense({merchant:'ZOMATO LTD',categoryId}));
 const trained=historicalRules(rows,[]);
 assert.equal(classifiedAlert(alert(),[rule()],cats,[],trained.conflicts).categoryId,'gifts');
 const crossFamily=historicalRules([...rows,expense({merchant:'Zomato',categoryId:'gifts'})],[]);
 assert.deepEqual(crossFamily.conflicts,['zomato']);
 assert.equal(classifiedAlert(alert(),[],cats,[],crossFamily.conflicts).categoryId,'other');
 assert.equal(classifiedAlert(alert({direction:'credit'}),[],cats,[],trained.conflicts).categoryId,'other');
 assert.equal(classifiedAlert(alert({special:true}),[],cats,[],trained.conflicts).categoryId,'other');
});
