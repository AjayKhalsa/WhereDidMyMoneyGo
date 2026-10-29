import assert from 'node:assert/strict';
import test from 'node:test';
import {suggestCategory} from '@/lib/gmail/classification';
import {parseExpenseInput} from '@/lib/engine/parser';
import {recognizedMerchants} from '@/lib/engine/merchant-recognition';
import type {Alert} from '@/lib/gmail/alerts';
const categories=['other','dining','transport.auto','gifts','essentials'].map(id=>({id}));
const alert=(merchant:string):Alert=>({bank:'HDFC',instrument:'bank',tail:'7900',amount:10000,date:'2026-10-29',direction:'debit',merchant,paymentRail:'UPI',upiRecipientKind:'person'});
test('food businesses win over small personal UPI heuristic without inventing time',()=>{
 for(const name of ['Tea Post','Nariyal Pani','BLUE TOKAI','Third Wave','Cafe Madras','Example Restaurant','Example Bar and Kitchen','Amar Juice Centre']) {
  const result=suggestCategory(alert(name),[],categories);
  assert.equal(result.categoryId,'dining',name); assert.equal(result.needsReview,false,name);
 }
});
test('merchant phrases also work in manual entry',()=>{
 for(const name of ['Tea Post','Nariyal Pani','Blue Tokai']) { const parsed=parseExpenseInput(`100 ${name}`); assert.ok(parsed.categoryId?.startsWith('dining'),name); assert.equal(parsed.merchant,name); }
});
test('do not infer dining from location, ambiguous names, substrings or business suppliers',()=>{
 for(const name of ['Mumbai','Social','Tea Postal Services','Restaurant Equipment','Cafe Supplies','Hotel Sunshine']) {
  const result=suggestCategory({...alert(name),paymentRail:undefined},[],categories);
  assert.equal(result.needsReview,true,name);
 }
 assert.equal(recognizedMerchants('Tea Postal Services').length,0);
});
test('saved corrections, financial purpose and absent categories remain protected',()=>{
 const rule={id:'r',pattern:'tea post',categoryId:'gifts',contexts:[],confidence:1,timesApplied:2,createdAt:'2026-10-01',updatedAt:'2026-10-01'};
 assert.equal(suggestCategory(alert('Tea Post'),[rule],categories).categoryId,'gifts');
 assert.equal(suggestCategory({...alert('Tea Post'),direction:'credit'},[],categories).needsReview,true);
 assert.equal(suggestCategory({...alert('Tea Post'),special:true},[],categories).needsReview,true);
 assert.equal(suggestCategory(alert('Tea Post'),[],[{id:'other'}]).needsReview,true);
 assert.equal(suggestCategory(alert('Tea Post'),[],categories,[],['tea post']).needsReview,true);
 assert.equal(suggestCategory(alert('SWIGGY INSTAMART'),[],categories).categoryId,'dining');
});

test('requested platforms default to Food & Dining in Gmail and manual logging',()=>{
 for(const merchant of ['Swiggy','Instamart','Swiggy Instamart','Zomato','Zepto','District']) {
  const source=alert(merchant), before=JSON.stringify(source);
  const suggestion=suggestCategory(source,[],categories);
  assert.equal(suggestion.categoryId,'dining',merchant);
  assert.equal(suggestion.needsReview,false,merchant);
  assert.equal(parseExpenseInput(`250 ${merchant}`).categoryId,'dining',merchant);
  assert.equal(JSON.stringify(source),before);
 }
 assert.equal(parseExpenseInput('250 Swiggy Instamart').merchant,'Instamart');
 const rule={id:'r',pattern:'zepto',categoryId:'essentials',contexts:[],confidence:1,timesApplied:2,createdAt:'2026-10-01',updatedAt:'2026-10-01'};
 assert.equal(suggestCategory(alert('Zepto'),[rule],categories).categoryId,'essentials');
 assert.equal(parseExpenseInput('250 Zepto',{rules:[rule]}).categoryId,'essentials');
});

test('platform preference does not mistake groceries or tickets for dinner',()=>{
 const cats=[...categories,{id:'dining.dinner'}];
 for(const merchant of ['Swiggy Instamart','Zepto','District']) {
  assert.equal(suggestCategory({...alert(merchant),occurredAt:'2026-10-29T21:00:00',timeSource:'bank',timeConfidence:'exact'},[],cats).categoryId,'dining');
  assert.equal(parseExpenseInput(`250 ${merchant}`,{actualTime:'2026-10-29T21:00:00'}).categoryId,'dining');
 }
 assert.equal(suggestCategory({...alert('Zomato'),occurredAt:'2026-10-29T21:00:00',timeSource:'bank',timeConfidence:'exact'},[],cats).categoryId,'dining.dinner');
});
