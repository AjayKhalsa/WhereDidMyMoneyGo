import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCategorySeed} from '@/lib/domain/categories';
import {suggestCategory} from '@/lib/gmail/classification';
import {parseExpenseInput} from '@/lib/engine/parser';
import type {Alert} from '@/lib/gmail/alerts';
const categories=buildCategorySeed();
const alert=(merchant:string):Alert=>({bank:'HDFC',instrument:'bank',tail:'7900',amount:10000,date:'2026-10-29',direction:'debit',merchant,paymentRail:'UPI',upiRecipientKind:'person'});
test('all approved subcategories have evidence-based automatic paths in Gmail and quick entry',()=>{
 const examples=[['Zomato','dining.delivery'],['Swiggy','dining.delivery'],['Swiggy Instamart','dining.groceries'],['Zepto','dining.groceries'],['Tea Post','dining.tea'],['Nariyal Pani','dining.tea'],['Example Restaurant','dining.restaurant'],['Household Supplies','essentials.household'],['GoMechanic','transport.maintenance'],['Example Toll Plaza','transport.tolls'],['Property Tax','bills.taxes'],['Charity Donation','gifts.donations'],['Coursera','education.courses'],['Kitab Khana','education.books'],['Metropolis Diagnostics','health.tests']];
 for(const [merchant,categoryId] of examples){
  const a=alert(merchant!),before=JSON.stringify(a),result=suggestCategory(a,[],categories);
  assert.equal(result.categoryId,categoryId,merchant);assert.equal(result.needsReview,false,merchant);
  assert.equal(parseExpenseInput(`100 ${merchant}`).categoryId,categoryId,merchant);
  assert.equal(JSON.stringify(a),before);
 }
});
test('manual rules, conflicts, financial purpose and missing categories remain protected',()=>{
 const rule={id:'r',pattern:'zepto',categoryId:'essentials',contexts:[],confidence:1,timesApplied:3,createdAt:'2026-10-01',updatedAt:'2026-10-01'};
 assert.equal(suggestCategory(alert('Zepto'),[rule],categories).categoryId,'essentials');
 assert.equal(parseExpenseInput('100 Zepto',{rules:[rule]}).categoryId,'essentials');
 assert.equal(suggestCategory(alert('Zepto'),[],categories,[],['zepto']).needsReview,true);
 assert.equal(suggestCategory({...alert('Coursera'),direction:'credit'},[],categories).needsReview,true);
 assert.equal(suggestCategory({...alert('Coursera'),special:true},[],categories).needsReview,true);
 assert.equal(suggestCategory(alert('Coursera'),[],[{id:'other'}]).needsReview,true);
 for(const merchant of ['FASTag recharge','Tax Consulting Services','Medical Equipment','District','Swiggy Amazon'])assert.notEqual(suggestCategory(alert(merchant),[],categories).categoryId,'transport.tolls');
 assert.equal(suggestCategory(alert('Swiggy Amazon'),[],categories).needsReview,true);
});
test('meal clock refines food orders only; refreshment/grocery specificity survives',()=>{
 for(const [merchant,expected] of [['Zomato','dining.dinner'],['Example Restaurant','dining.dinner'],['Tea Post','dining.tea'],['Zepto','dining.groceries']]) {
  assert.equal(suggestCategory({...alert(merchant!),occurredAt:'2026-10-29T21:00:00',timeSource:'bank',timeConfidence:'exact'},[],categories).categoryId,expected);
 }
 assert.equal(suggestCategory({...alert('Zomato'),occurredAt:'2026-10-29T00:00:00',timeSource:'unknown'},[],categories).categoryId,'dining.delivery');
});
