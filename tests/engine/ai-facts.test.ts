import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAIFacts,providerFacts,validateAIInsights} from '@/lib/ai/facts';
import {buildCategorySeed} from '@/lib/domain/categories';
import {expense,income,transfer,makeAccount,makeCard,rs} from '../helpers/factories';
const options={categories:[...buildCategorySeed(),{id:'private-category',name:'Private medical detail',parentId:null,order:999,system:false}],accounts:[makeAccount({id:'bank',name:'PRIVATE ACCOUNT 7900'}),makeCard({id:'card',isActive:false})],month:'2026-10-24',cycleStartDay:24,now:new Date('2026-10-30T18:00:00Z')};
const run=(transactions:ReturnType<typeof expense>[],over={})=>buildAIFacts({...options,transactions,...over});
const valid={heading:'Food habits stand out',interpretation:'Recorded dining purchases are worth a closer look.',nextStep:'Review the delivery entries before changing the routine.',factIds:['spending']};

test('facts separate net spending, earned receipts, gross contributions and returned principal with original evidence',()=>{
 const rows=[expense({id:'purchase',date:'2026-10-25T12:00:00',amount:rs(1000),merchant:'ZOMATO LTD',categoryId:'dining.delivery',accountId:'card',timing:{source:'bank',precision:'exact',timezone:'Asia/Kolkata'}}),income({date:'2026-10-27',amount:rs(200),isRefund:true,reversesTransactionId:'purchase',accountId:'card'}),expense({date:'2026-10-28',amount:rs(400),merchant:'PRIVATE PERSON',categoryId:'private-category',accountId:'bank'}),income({date:'2026-10-28',amount:rs(5000)}),income({date:'2026-10-28',amount:rs(648)}),expense({date:'2026-10-28',type:'INVESTMENT',amount:rs(30000)}),transfer({date:'2026-10-29',amount:rs(50000),accountId:'fd',toAccountId:'bank',investmentId:'holding'}),transfer({date:'2026-10-29',amount:rs(64000),accountId:'bank',toAccountId:'card'}),expense({date:'2026-10-29',categoryId:'adjustment',amount:rs(99999)})];
 const before=structuredClone(rows),result=run(rows),fact=(id:string)=>result.facts.find(f=>f.id===id)!;
 assert.equal(fact('spending').metrics[0]!.value,rs(1200));assert.equal(fact('spending').transactionIds.length,3);
 assert.equal(fact('income').metrics[0]!.value,rs(5648));assert.equal(fact('contributions').metrics[0]!.value,rs(30000));assert.equal(fact('withdrawals').metrics[0]!.value,rs(50000));
 assert.equal(fact('source_card').metrics[0]!.value,rs(800));assert.equal(fact('food_delivery').metrics[0]!.value,rs(800));assert.equal(fact('time_coverage').metrics[0]!.value,1);
 assert.deepEqual(rows,before);
});

test('provider projection removes private names, notes, account identifiers and financial source IDs while retaining public evidence metrics',()=>{
 const rows=[expense({id:'SECRET-TX-ID',date:'2026-10-25',merchant:'PRIVATE PERSON',categoryId:'private-category',accountId:'bank',notes:'RAW EMAIL private@example.com secret',amount:rs(400)}),expense({date:'2026-10-26',merchant:'Tea Post',categoryId:'dining.tea',amount:rs(80)})];
 const context=run(rows),payload=JSON.stringify(providerFacts(context));
 for(const value of ['PRIVATE PERSON','Private medical detail','PRIVATE ACCOUNT','7900','SECRET-TX-ID','RAW EMAIL','private@example.com','secret','transactionIds','accountId'])assert.equal(payload.includes(value),false,value);
 assert.equal(payload.includes('Tea Post'),true);assert.equal(payload.includes('Custom category'),true);assert.equal(context.facts.some(f=>f.title==='PRIVATE PERSON'),true,'Private labels remain available only inside the authenticated app');
 const renamed=options.categories.map(c=>c.id==='dining'?{...c,name:'Private custom label'}:c);assert.equal(JSON.stringify(providerFacts(run(rows,{categories:renamed}))).includes('Private custom label'),false);
});

test('snapshot is order independent and changes with financial facts; unknown clocks and future boundaries retain Indian dates',()=>{
 const rows=[expense({id:'b',date:'2026-10-31',merchant:'Tea Post',amount:rs(100)}),expense({id:'a',date:'2026-10-31',merchant:'Tea Post',amount:rs(200)}),expense({date:'2026-10-31T23:59:00',timing:{source:'bank',precision:'exact',timezone:'Asia/Kolkata'},amount:rs(90000)})];
 const over={now:new Date('2026-10-30T20:00:00Z')},first=run(rows,over);
 assert.equal(first.facts[0]!.metrics[0]!.value,rs(300));assert.equal(first.snapshot,run([...rows].reverse(),over).snapshot);
 assert.notEqual(first.snapshot,run([{...rows[0]!,amount:rs(101)},...rows.slice(1)],over).snapshot);
 assert.equal(run(rows,{month:'2026-11-24'}).facts[0]!.transactionIds.length,0);
});

test('AI interpretations must reference real facts and cannot return invented numeric amounts, links or duplicate evidence',()=>{
 const context=run([expense({date:'2026-10-25'})]);assert.equal(validateAIInsights({insights:[valid]},context).length,1);
 for(const value of [{insights:[{...valid,factIds:['missing']}]},{insights:[{...valid,interpretation:'You spent ₹9999.'}]},{insights:[{...valid,heading:'Save ५००'}]},{insights:[{...valid,nextStep:'Open https://example.com'}]},{insights:[{...valid,interpretation:'<script>bad</script>'}]},{insights:[valid,valid]},{insights:[{...valid,amount:100}]},{insights:[]},{insights:[{...valid,factIds:['spending','spending']}]}])assert.throws(()=>validateAIInsights(value,context));
});

test('comparison and category changes use equal prefixes while current category totals retain the full cycle',()=>{
 const rows=[expense({date:'2026-03-30',amount:rs(300),categoryId:'dining'}),expense({date:'2026-02-28',amount:rs(50),categoryId:'dining'})];
 const context=run(rows,{month:'2026-03-01',cycleStartDay:1,now:new Date('2026-04-10T12:00:00Z')});
 assert.equal(context.facts.find(f=>f.id==='comparison')!.metrics[0]!.value,-rs(50));assert.equal(context.facts.find(f=>f.id==='comparison')!.currentIds!.length,0);
 assert.equal(context.facts.find(f=>f.id==='category_0')!.metrics[0]!.value,rs(300));assert.equal(context.facts.find(f=>f.id==='change_0')!.metrics[0]!.value,-rs(50));
});
