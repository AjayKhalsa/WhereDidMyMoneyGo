import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestCategory} from '@/lib/gmail/classification';
import {parseExpenseInput} from '@/lib/engine/parser';
import {buildCategorySeed} from '@/lib/domain/categories';
import {categorySearchMatch} from '@/lib/domain/category-search';
import type {Alert} from '@/lib/gmail/alerts';
const categories=buildCategorySeed();
const alert=(merchant:string):Alert=>({bank:'HDFC',instrument:'bank',tail:'7900',amount:30000,date:'2026-10-29',direction:'debit',merchant});
test('pharmacy and personal care use existing specific categories',()=>{
 for(const merchant of ['Apollo Pharmacy','PharmEasy','Tata 1mg','Netmeds','MedPlus']) {
  assert.equal(suggestCategory(alert(merchant),[],categories).categoryId,'health.medicine',merchant);
  assert.equal(parseExpenseInput(`300 ${merchant}`).categoryId,'health.medicine',merchant);
 }
 assert.equal(suggestCategory(alert('Nykaa'),[],categories).categoryId,'shopping.personal');
 assert.equal(suggestCategory(alert('Apollo Tyres'),[],categories).needsReview,true);
 const rule={id:'r',pattern:'netmeds',categoryId:'essentials',contexts:[],confidence:1,timesApplied:3,createdAt:'2026-10-01',updatedAt:'2026-10-01'};
 assert.equal(suggestCategory(alert('Netmeds'),[rule],categories).categoryId,'essentials');
});
test('explicit subscription services are recognised without assuming a generic platform charge',()=>{
 for(const merchant of ['Netflix','Spotify','Apple Music','YouTube Premium','iCloud','Google One','Dropbox','Microsoft 365','Adobe','Xbox Game Pass','PlayStation Plus','Apple Arcade','YouTube Music']) {
  assert.equal(suggestCategory(alert(merchant),[],categories).categoryId,'bills.subscription',merchant);
 }
 for(const merchant of ['Apple','Google','Amazon','Xbox'])assert.notEqual(suggestCategory(alert(merchant),[],categories).categoryId,'bills.subscription',merchant);
});
test('pharmacy, personal-care and app-name searches find existing categories',()=>{
 assert.ok(categorySearchMatch('health.medicine','Medicine','pharmacy'));
 assert.ok(categorySearchMatch('shopping.personal','Personal','personal care'));
 assert.ok(categorySearchMatch('bills.subscription','Subscription','netflix'));
 assert.ok(!categorySearchMatch('health.medicine','Medicine','netflix'));
});
