import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLearning } from '../../src/lib/gmail/learning-evaluation';
import type { Transaction } from '../../src/lib/domain/types';
const categories=[{id:'transport',name:'Transport',parentId:null},{id:'transport.cab',name:'Cab',parentId:'transport'},{id:'shopping',name:'Shopping',parentId:null},{id:'other',name:'Other',parentId:null}];
const rows=Array.from({length:4},(_,i)=>({id:String(i),date:`2026-08-0${i+1}`,type:'EXPENSE',source:'manual',amount:10000,categoryId:'transport.cab',merchant:'Example Driver',description:'Example Driver',contexts:[],createdAt:'2026-08-01',updatedAt:'2026-08-01'} as Transaction));
test('held-out correction cannot leak into the trained rule',()=>{
 const report=evaluateLearning(rows.map((t,i)=>i===3?{...t,categoryId:'shopping'}:t),categories);
 assert.equal(report.heldOut,1);assert.equal(report.autoTagged,1);assert.equal(report.falsePositiveAutoTags,1);assert.equal(report.categoryAccuracy,0);assert.equal(report.rows[0]!.predicted,'transport.cab');assert.equal(report.conflictingMerchants,1);
});
test('same-day and machine-enriched labels cannot inflate held-out evidence',()=>{
 assert.equal(evaluateLearning(rows.map(t=>({...t,date:'2026-08-01'})),categories).heldOut,0);
 assert.equal(evaluateLearning(rows.map((t,i)=>i===0?{...t,enrichment:{version:1,ruleIds:[]}}:t),categories).heldOut,0);
 const before=JSON.stringify(rows);const report=evaluateLearning(rows,categories);assert.equal(report.subcategoryAccuracy,100);assert.equal(JSON.stringify(rows),before);
});
