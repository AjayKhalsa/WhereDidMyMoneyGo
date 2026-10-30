import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {learningData} from '@/lib/gmail/learning-data';

const user='11111111-1111-4111-8111-111111111111';
const row=(id:string,over:Record<string,unknown>={})=>({id,user_id:user,type:'EXPENSE',amount:10000,source:'imported',category_id:'dining.delivery',merchant:'Zomato',description:'Zomato',...over});
function database(tables:Record<string,Record<string,any>[]>,mode='complete'){
 const calls:URL[]=[];
 const client=createClient('https://database.example','synthetic',{auth:{persistSession:false},global:{fetch:async(input,init)=>{
  const url=new URL(String(input));calls.push(url);
  assert.equal(init?.method??'GET','GET');
  assert.equal(url.searchParams.get('user_id'),`eq.${user}`);
  assert.match(new Headers(init?.headers).get('prefer')??'',/count=exact/);
  const table=url.pathname.split('/').at(-1)!;
  assert.ok(url.searchParams.get('order'),'Stable order required');
  const filtered=(tables[table]??[]).filter(r=>(!url.searchParams.has('type')||`eq.${r.type}`===url.searchParams.get('type'))&&(!url.searchParams.has('status')||`eq.${r.status}`===url.searchParams.get('status')));
  const from=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??500);
  if(mode==='error'&&from>0)return new Response(JSON.stringify({message:'Private server detail'}),{status:500});
  const data=mode==='empty'&&from>0?[]:filtered.slice(mode==='duplicate'&&from>0?0:from,(mode==='duplicate'&&from>0?0:from)+Math.min(limit,137));
  const total=filtered.length+(mode==='changed'&&from>0?1:0);
  return new Response(JSON.stringify(data),{headers:{'content-type':'application/json',...(mode==='no-count'?{}:{'content-range':`${from}-${from+data.length-1}/${total}`})}});
 }}});
 return {client,calls};
}

test('loads all rules, contexts, categories, source predictions and history under smaller server caps',async()=>{
 const rules=Array.from({length:1203},(_,i)=>({id:`r${i}`,user_id:user,category_id:'dining',pattern:`merchant${i}`}));
 const contexts=rules.map(r=>({rule_id:r.id,user_id:user,type:'PURPOSE',value:'work'}));
 const categories=Array.from({length:1003},(_,i)=>({id:`c${i}`,user_id:user,name:`Category ${i}`}));
 const transactions=Array.from({length:1203},(_,i)=>row(`gmail_${i}`,{merchant:`Merchant ${i}`}));
 const messages=transactions.map(t=>({message_id:`m${t.id}`,user_id:user,status:'logged',transaction_id:t.id,candidate:{categoryId:'other'}}));
 const {client,calls}=database({rules,rule_contexts:contexts,categories,transactions,gmail_messages:messages});
 const learned=await learningData(client,user,true);
 assert.equal(learned.rules.length,1203);assert.equal(learned.categories.length,1003);assert.equal(learned.transactions.length,1203);
 assert.deepEqual(learned.rules.at(-1)!.contexts,[{type:'PURPOSE',value:'work'}]);
 assert.equal(learned.transactions.at(-1)!.id,'gmail_1202');
 assert.ok(calls.some(url=>Number(url.searchParams.get('offset'))>1000));
});

test('partial, duplicate, failed and changing-count learning responses never train from an incomplete subset',async()=>{
 const rules=Array.from({length:300},(_,i)=>({id:`r${i}`,user_id:user}));
 for(const mode of ['empty','duplicate','error','changed','no-count']){
  const {client}=database({rules},mode);
  await assert.rejects(learningData(client,user),/complet|ledger changed/i,mode);
 }
});

test('receipt attachments and machine predictions do not count as manual corrections',async()=>{
 const transactions=[
  row('receipt-only'),row('actual-correction'),row('same-prediction'),row('unknown-prediction'),
  row('auto-manual',{source:'manual',enrichment:{version:1,ruleIds:['automatic']}}),
  row('corrected-machine',{source:'manual',enrichment:{version:1,ruleIds:['automatic']}}),
  row('manual',{source:'manual'}),row('parsed',{source:'parsed'}),row('txn_reviewed'),
  row('refund',{source:'manual',is_refund:true}),row('negative',{source:'manual',amount:-100}),
  row('zero',{source:'manual',amount:0}),row('reversal',{source:'manual',reverses_transaction_id:'original'}),
  row('adjustment',{source:'manual',category_id:'adjustment'}),
 ];
 const gmail_messages=[
  {transaction_id:'receipt-only',candidate:{provider:'Zomato',kind:'food-receipt'}},
  {transaction_id:'actual-correction',candidate:{categoryId:'other'}},
  {transaction_id:'same-prediction',candidate:{categoryId:'dining.delivery'}},
  {transaction_id:'unknown-prediction',candidate:{categoryId:null}},
  {transaction_id:'corrected-machine',candidate:{categoryId:'other'}},
 ].map((r,i)=>({...r,message_id:`m${i}`,user_id:user,status:'logged'}));
 const {client}=database({transactions,gmail_messages});
 const learned=await learningData(client,user,true);
 assert.deepEqual(learned.transactions.map(t=>t.id),['actual-correction','corrected-machine','manual','parsed','txn_reviewed']);
});
