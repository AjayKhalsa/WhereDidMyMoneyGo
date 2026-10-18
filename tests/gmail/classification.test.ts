import assert from "node:assert/strict";
import test from "node:test";
import {suggestCategory,historicalRules,correctedRule} from "@/lib/gmail/classification";
import {parseExpenseInput} from "@/lib/engine/parser";
import type {Alert} from "@/lib/gmail/alerts";
import type {ClassificationRule} from "@/lib/domain/types";
import {expense} from "../helpers/factories";
const categories=['other','dining','dining.breakfast','dining.lunch','dining.snacks','dining.dinner','transport','transport.cab','gifts','essentials'].map(id=>({id}));
const alert=(over:Partial<Alert>={}):Alert=>({bank:'HDFC',instrument:'bank',tail:'1234',amount:15000,date:'2026-10-18',merchant:'Zomato',direction:'debit',...over});
const rule=(over:Partial<ClassificationRule>={}):ClassificationRule=>({id:'saved',pattern:'zomato',categoryId:'gifts',contexts:[],confidence:0.95,timesApplied:5,createdAt:'2026-10-01',updatedAt:'2026-10-01',...over});
test('explicit saved mapping outranks food clocks and personal-UPI heuristics',()=>{
 assert.equal(suggestCategory(alert({occurredAt:'2026-10-18T13:00:00',timeSource:'bank'}),[rule()],categories).categoryId,'gifts');
 assert.equal(suggestCategory(alert({merchant:'Example Driver',paymentRail:'UPI',vpa:'driver@bank'}),[rule({pattern:'driver',categoryId:'gifts'})],categories).categoryId,'gifts');
});
test('all requested IST meal boundaries use reliable time; delayed email is only a suggestion',()=>{
 for(const [time,leaf] of [['00:00:00','breakfast'],['11:59:59','breakfast'],['12:00:00','lunch'],['15:59:59','lunch'],['16:00:00','snacks'],['19:59:59','snacks'],['20:00:00','dinner'],['23:59:59','dinner']])assert.equal(suggestCategory(alert({occurredAt:`2026-10-18T${time}`,timeSource:'bank'}),[],categories).categoryId,`dining.${leaf}`);
 assert.equal(suggestCategory(alert(),[],categories).categoryId,'dining');
 assert.equal(suggestCategory(alert({occurredAt:'2026-10-18T00:00:00',timeSource:'unknown'}),[],categories).categoryId,'dining');
 assert.equal(suggestCategory(alert({occurredAt:'2026-10-18T13:00:00',timeSource:'gmail'}),[],categories).needsReview,true);
 assert.notEqual(suggestCategory(alert({merchant:'Uber',occurredAt:'2026-10-18T13:00:00',timeSource:'bank'}),[],categories).source,'meal');
});
test('small personal UPI is a debit-only under-200 preference without inventing Cab',()=>{
 const a=alert({merchant:'Example Person',paymentRail:'UPI',vpa:'person@bank'});
 assert.equal(suggestCategory(a,[],categories).categoryId,'transport');
 for(const over of [{direction:'credit' as const},{amount:20000},{special:true},{merchant:'Example Store'},{merchant:'Self Person'},{vpa:'***@bank'},{vpa:undefined}])assert.notEqual(suggestCategory({...a,...over},[],categories,['Self Person']).source,'small-upi');
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
