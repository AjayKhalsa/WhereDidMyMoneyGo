import assert from 'node:assert/strict';
import test from 'node:test';
import {suggestCategory} from '@/lib/gmail/classification';
import {parseExpenseInput} from '@/lib/engine/parser';
import {buildCategorySeed} from '@/lib/domain/categories';
import type {Alert} from '@/lib/gmail/alerts';
const categories=buildCategorySeed();
const alert=(merchant:string):Alert=>({bank:'HDFC',instrument:'bank',tail:'1234',amount:50000,date:'2026-10-30',direction:'debit',merchant});
test('new food, pharmacy, personal-care and subscription evidence agrees across Gmail and entry',()=>{
 for(const [merchant,expected] of [["Good Flippin' Burgers",'dining.restaurant'],['Bee Laban','dining.restaurant'],['Kanha Sweets','dining.restaurant'],['Pehlwan Kulcha Shop','dining.restaurant'],['Ram Ashraya','dining.restaurant'],['Blue Tokai Coffee Roasters Chembur','dining.coffee'],['Prithvi Cafe','dining.coffee'],['Example Chemist','health.medicine'],['Example Pharmacy','health.medicine'],['Example Hair Salon','shopping.personal'],['Apple One','bills.subscription'],['LinkedIn Premium','bills.subscription'],['Google One','bills.subscription'],['Amazon Prime Membership','bills.subscription'],['GitHub Copilot','bills.subscription']]){
  assert.equal(suggestCategory(alert(merchant!),[],categories).categoryId,expected,merchant);
  assert.equal(parseExpenseInput(`500 ${merchant}`).categoryId,expected,merchant);
 }
});
test('ambiguous businesses, credits, missing leaves, conflicts and saved corrections remain protected',()=>{
 for(const name of ['Pharmacy Equipment Supplier','Salon Software Services','Kanha Sharma','Good Flippin Burgers Amazon'])assert.equal(suggestCategory(alert(name),[],categories).needsReview,true,name);
 assert.equal(suggestCategory({...alert('Example Pharmacy'),direction:'credit'},[],categories).needsReview,true);
 assert.equal(suggestCategory(alert('Example Pharmacy'),[],[{id:'other'}]).needsReview,true);
 const rule={id:'r',pattern:'bee laban',categoryId:'gifts',contexts:[],confidence:1,timesApplied:3,createdAt:'2026-10-01',updatedAt:'2026-10-01'};
 assert.equal(suggestCategory(alert('Bee Laban'),[rule],categories).categoryId,'gifts');assert.equal(parseExpenseInput('500 Bee Laban',{rules:[rule]}).categoryId,'gifts');
});
