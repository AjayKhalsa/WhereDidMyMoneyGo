import assert from "node:assert/strict";
import test from "node:test";
import { writeTransactionCompatible } from "@/lib/data/transaction-write";
const unknown={source:'unknown',precision:'date',timezone:'Asia/Kolkata'};
const row={id:'existing',amount:50000,account_id:'bank',category_id:'travel.flight',notes:'Keep this',timing:unknown,enrichment:null};
const missing=(column:string)=>({code:'PGRST204',message:`Could not find the '${column}' column of 'transactions' in the schema cache`});
test('category edit works on older schema without dropping financial or manual fields',async()=>{
 const calls:Record<string,unknown>[]=[];
 await writeTransactionCompatible(row,async payload=>{calls.push({...payload});return 'timing' in payload?missing('timing'):'enrichment' in payload?missing('enrichment'):null;});
 assert.equal(calls.length,3);const {timing,enrichment,...expected}=row;assert.deepEqual(calls[2],expected);assert.deepEqual(row.timing,unknown);
});
test('current schema preserves all metadata in one write',async()=>{
 let calls=0;await writeTransactionCompatible(row,async payload=>{calls++;assert.deepEqual(payload,row);return null;});assert.equal(calls,1);
});
test('known clocks, explicit unknown overrides of legacy clocks and enrichment are never silently discarded',async()=>{
 for(const input of [{...row,timing:{...unknown,source:'user',precision:'exact'}},{...row,notes:'; transaction time 2026-10-12T20:00:00 Asia/Kolkata; source bank'}]){
 let calls=0;await assert.rejects(writeTransactionCompatible(input,async()=>{calls++;return missing('timing');}),/migration 0020/);assert.equal(calls,1);
 }
 await assert.rejects(writeTransactionCompatible({...row,enrichment:{version:1,ruleIds:['rule']}},async()=>missing('enrichment')),/migration 0020/);
});
test('permissions, network and unrelated schema errors are not retried',async()=>{
 for(const error of [{code:'42501',message:'Permission denied'},{code:'23505',message:'Duplicate ID'},{code:'PGRST204',message:"Could not find the 'amount' column"},{message:'Network unavailable'}]){
 let calls=0;await assert.rejects(writeTransactionCompatible(row,async()=>{calls++;return error;}));assert.equal(calls,1);
 }
});
