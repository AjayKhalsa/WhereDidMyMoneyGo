import test from 'node:test';
import assert from 'node:assert/strict';
import {currentCategoryReviews} from '@/lib/gmail/category-review';
import {buildCategorySeed} from '@/lib/domain/categories';
import {makeRule} from '../helpers/factories';
const categories=buildCategorySeed();
const row={id:'saved',user_id:'user',type:'EXPENSE',amount:41594,date:'2026-10-30T00:00:00',merchant:'ZOMATO LTD',description:'ZOMATO LTD',account_id:'bank',category_id:'other',notes:'Preserve source evidence',is_refund:false,enrichment:{version:1,ruleIds:[]}};
const candidate={bank:'HDFC',instrument:'bank',tail:'7900',merchant:'ZOMATO LTD',amount:41594,date:'2026-10-30',accountId:'bank',direction:'debit',categoryId:'other',timeSource:'gmail',timeConfidence:'fallback',occurredAt:'2026-10-30T20:32:34',classification:{categoryId:'other',needsReview:true,reason:'Old conflict'}};
const receipt={message_id:'message',status:'logged',category_review:true,transaction_id:'saved',category_review_snapshot:structuredClone(row),candidate};

test('old unchanged Other entries receive current suggestions without altering receipt or financial identity',()=>{
 const before=structuredClone({row,receipt});
 const [review]=currentCategoryReviews([receipt],[row],[],categories);
 assert.equal(review!.categorySuggestion?.categoryId,'dining.delivery');
 assert.equal(review!.categorySuggestion?.needsReview,false);
 assert.deepEqual(review!.candidate,candidate,'Original evidence remains intact');
 assert.deepEqual({row,receipt},before);
});

test('snapshot comparison ignores key order but catches every edited or missing row',()=>{
 const reversed=Object.fromEntries(Object.entries(row).reverse());
 assert.equal(currentCategoryReviews([receipt],[reversed],[],categories)[0]!.categorySuggestion?.categoryId,'dining.delivery');
 for(const rows of [[],[{...row,notes:'User changed notes'}],[{...row,amount:100}],[{...row,enrichment:{version:1,ruleIds:['changed']}}]]){
  const [review]=currentCategoryReviews([receipt],rows,[],categories);
  assert.equal(review!.categorySuggestion,undefined);assert.equal(review!.entryChanged,true);
 }
 for(const snapshot of [null,{}])assert.equal(currentCategoryReviews([{...receipt,category_review_snapshot:snapshot}],[row],[],categories)[0]!.entryChanged,true);
});

test('specific categories and non-spending rows never receive automatic cleanup suggestions',()=>{
 for(const change of [{category_id:'dining.dinner'},{type:'INCOME'},{type:'TRANSFER'},{type:'INVESTMENT'},{is_refund:true},{amount:0},{amount:-100},{reverses_transaction_id:'purchase'}]){
  const entry={...row,...change};
  assert.equal(currentCategoryReviews([{...receipt,category_review_snapshot:entry}],[entry],[],categories)[0]!.categorySuggestion,undefined);
 }
});

test('unresolved, dismissed, ambiguous or inconsistent source evidence is not promoted to a current suggestion',()=>{
 for(const change of [{status:'review'},{status:'ignored'},{category_review:false},{candidate:{...candidate,accountId:'other-bank'}},{candidate:{...candidate,amount:200}},{candidate:{...candidate,date:'2026-10-29'}},{candidate:{...candidate,direction:'credit'}},{candidate:{...candidate,special:true}},{candidate:undefined}]){
  assert.equal(currentCategoryReviews([{...receipt,...change}],[row],[],categories)[0]!.categorySuggestion,undefined);
 }
 const rules=[makeRule({pattern:'zomato',categoryId:'dining',confidence:0.95}),makeRule({pattern:'zomato',categoryId:'gifts',confidence:0.95})];
 assert.equal(currentCategoryReviews([receipt],[row],rules,categories)[0]!.categorySuggestion,undefined);
 assert.equal(currentCategoryReviews([receipt],[row],[],categories,[],['zomato'])[0]!.categorySuggestion,undefined);
 assert.equal(currentCategoryReviews([receipt],[row],[],categories.filter(c=>!c.id.startsWith('dining')))[0]!.categorySuggestion,undefined);
});
