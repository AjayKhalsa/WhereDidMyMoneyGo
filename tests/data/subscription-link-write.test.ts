import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseRepository } from '@/lib/data/supabase-adapter';

test('cloud linking patches only metadata, scopes both reads and write to owner, and detects stale payments',async()=>{
 const owner='11111111-1111-4111-8111-111111111111';
 const payment={id:'debit',user_id:owner,type:'EXPENSE',amount:19500,account_id:'bank',date:'2026-11-25T00:00:00',source:'imported',description:'APPLE MEDIA SERVICES',notes:'reference 123456789012',recurring_id:null};
 const rule={id:'subscription',user_id:owner,type:'EXPENSE',amount:19500,account_id:'bank',description:'YouTube',category_id:'bills.subscription'};
 const queries:{table:string;filters:[string,unknown][];payload?:Record<string,unknown>}[]=[];let stale=false;
 const client={auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},from(table:string){const query={table,filters:[] as [string,unknown][],payload:undefined as Record<string,unknown>|undefined};queries.push(query);return new class {
  select(){return this;}update(payload:Record<string,unknown>){query.payload=payload;return this;}
  eq(key:string,value:unknown){query.filters.push([key,value]);return this;}is(key:string,value:unknown){query.filters.push([key,value]);return this;}
  async single(){return {data:table==='transactions'?payment:rule,error:null};}
  async maybeSingle(){return {data:stale?null:{id:payment.id},error:null};}
 }}};
 const repo=Object.assign(Object.create(SupabaseRepository.prototype),{client}) as SupabaseRepository;
 const input={transactionId:payment.id,ruleId:rule.id,amount:payment.amount,accountId:payment.account_id};
 await repo.linkSubscriptionPayment(input);
 assert.equal(queries.length,3);
 for(const query of queries)assert.ok(query.filters.some(([key,value])=>key==='user_id'&&value===owner));
 const write=queries[2]!;assert.deepEqual(Object.keys(write.payload!).sort(),['category_id','recurring_id','updated_at']);
 assert.equal(write.payload!.recurring_id,rule.id);assert.equal(write.payload!.category_id,rule.category_id);
 for(const pair of [['id','debit'],['amount',19500],['account_id','bank'],['type','EXPENSE'],['recurring_id',null]])assert.ok(write.filters.some(([key,value])=>key===pair[0]&&value===pair[1]));
 assert.equal(payment.amount,19500);assert.equal(payment.date,'2026-11-25T00:00:00');assert.equal(payment.notes,'reference 123456789012');
 stale=true;await assert.rejects(repo.linkSubscriptionPayment(input),/changed/);
 queries.length=0;await assert.rejects(repo.linkSubscriptionPayment({...input,amount:19400}),/changed/);assert.equal(queries.some(q=>q.payload),false);
});
