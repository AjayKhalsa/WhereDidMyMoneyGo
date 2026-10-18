import test from 'node:test';
import assert from 'node:assert/strict';
import { remapLegacyCategories } from '../../src/lib/data/category-migration';
import { buildCategorySeed } from '../../src/lib/domain/categories';
import { createEmptyDatabase } from '../../src/lib/data/seed';

test('custom dotted category survives boot without rewriting its ledger row', () => {
  const db=createEmptyDatabase();
  const custom={id:'income.salary',name:'Salary',parentId:null,order:12,system:false};
  db.categories=[...buildCategorySeed(),custom];
  db.transactions=[{id:'salary',type:'INCOME',amount:10000,date:'2026-09-24T00:00:00',description:'Salary',categoryId:custom.id,accountId:'bank',contexts:[],source:'manual',createdAt:'2026-09-24',updatedAt:'2026-09-24'}];
  const result=remapLegacyCategories(db);
  assert.equal(result.changed,false);
  assert.deepEqual(result.changedTransactions,[]);
  assert.deepEqual(result.db.categories,db.categories);
  assert.deepEqual(result.db.transactions,db.transactions);
});

test('genuine legacy migration preserves unrelated custom categories', () => {
  const db=createEmptyDatabase();
  const custom={id:'family',name:'Family transfers',parentId:null,order:13,system:false};
  db.categories=[...buildCategorySeed(),custom,{id:'misc.other',name:'Old Other',parentId:null,order:99,system:false}];
  const result=remapLegacyCategories(db);
  assert.equal(result.categoriesNeedRefresh,true);
  assert.deepEqual(result.db.categories.find(c=>c.id==='family'),custom);
  assert.equal(result.db.categories.some(c=>c.id==='misc.other'),false);
});
