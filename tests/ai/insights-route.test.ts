import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire,registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {buildAIFacts} from '@/lib/ai/facts';
import {AI_MODEL} from '@/lib/ai/policy';
import {buildCategorySeed} from '@/lib/domain/categories';
import {domainRow} from '@/lib/gmail/learning-data';
import type {Transaction,Account} from '@/lib/domain/types';
const require=createRequire(import.meta.url);
const hook=registerHooks({resolve(s,c,n){return n(s==='next/server'?pathToFileURL(require.resolve('next/server.js')).href:s,c);}});
after(()=>hook.deregister());
const {NextRequest}=await import('next/server.js');
const {GET,POST}=await import('@/app/api/ai/insights/route');
const {POST:classify}=await import('@/app/api/classify/route');

let sequence=0;
const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
const insight={heading:'Dining is worth exploring',interpretation:'The recorded food purchases are a useful starting point for review.',nextStep:'Look through the delivery entries before changing the routine.',factIds:['spending','food_delivery']};
function fixture(){
 const user=`11111111-1111-4111-8111-${String(++sequence).padStart(12,'0')}`;
 const keys=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','GEMINI_API_KEY','AI_FREE_TIER_CONFIRMED'] as const;
 const before=Object.fromEntries(keys.map(key=>[key,process.env[key]])),originalFetch=global.fetch;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://ai-test.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-anon';process.env.GEMINI_API_KEY='synthetic-private-key';process.env.AI_FREE_TIER_CONFIRMED='gemini-no-billing';
 const transactions=[{id:'private-tx-id',user_id:user,type:'EXPENSE',amount:100000,description:'Raw email never send',date:'2026-10-25T00:00:00',merchant:'Zomato',category_id:'dining.delivery',account_id:'bank',source:'manual',created_at:'2026-10-25',updated_at:'2026-10-25',notes:'private-note@example.com'},{id:'private-other-id',user_id:user,type:'EXPENSE',amount:30000,description:'Private person',date:'2026-10-26T00:00:00',merchant:'PRIVATE PERSON',category_id:'other',account_id:'bank',source:'manual',created_at:'2026-10-26',updated_at:'2026-10-26'}];
 const accounts=[{id:'bank',name:'PRIVATE BANK 7900',type:'BANK',opening_balance:1000000,is_active:true,created_at:'2026-01-01'}];
 const tables:Record<string,any[]>={transactions,categories:buildCategorySeed().map(c=>({id:c.id,name:c.name,parent_id:c.parentId})),accounts,income_sources:[{id:'salary',amount:1000000,deductions:0,is_active:true,recurring:true,day_of_month:24,created_at:'2026-01-01'}]};
 const stats={provider:0,reads:0,bodies:[] as string[],status:200,invalid:false,incomplete:false,classification:false};
 const json=(value:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});
 global.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.hostname==='ai-test.supabase.co'){
   if(url.pathname==='/auth/v1/user')return json({id:user,email:'private-owner@example.com',aud:'authenticated',role:'authenticated'});
   if(url.pathname.startsWith('/rest/v1/')){
    assert.equal(init?.method??'GET','GET','AI must never write financial data');assert.equal(url.searchParams.get('user_id'),`eq.${user}`,'Every collection must be owner filtered');stats.reads++;
    const table=url.pathname.split('/').at(-1)!;const all=tables[table];assert.ok(all,table);const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??500);
    const rows=stats.incomplete&&table==='transactions'?(offset===0?all.slice(0,1):[]):all.slice(offset,offset+limit);
    return json(rows,200,{'content-range':`${offset}-${Math.max(offset,offset+rows.length-1)}/${all.length}`});
   }
  }
  if(url.hostname==='generativelanguage.googleapis.com'){
   stats.provider++;assert.ok(url.pathname.includes(AI_MODEL));assert.equal(url.searchParams.has('key'),false);assert.equal(new Headers(init?.headers).get('x-goog-api-key'),'synthetic-private-key');
   const body=String(init?.body);stats.bodies.push(body);
   for(const value of [user,'private-tx-id','PRIVATE PERSON','PRIVATE BANK','7900','private-note@example.com','Raw email never send'])assert.equal(body.includes(value),false,value);
   if(stats.status!==200)return json({error:{code:stats.status,message:'private-upstream-error',status:'RESOURCE_EXHAUSTED'}},stats.status);
   const output=stats.classification?{categoryId:'dining.delivery',contexts:[],merchant:'Zomato',reason:'Known delivery merchant'}:{insights:[stats.invalid?{...insight,factIds:['invented-fact'],interpretation:'You spent ₹9999.'}:insight]};
   return json({candidates:[{index:0,content:{role:'model',parts:[{text:JSON.stringify(output)}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:100,totalTokenCount:200}});
  }
  throw new Error(`Unexpected HTTP target: ${url.hostname}`);
 };
 const access=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user,exp:Math.floor(Date.now()/1000)+3600})}.synthetic`;
 const session=`base64-${encode({access_token:access,refresh_token:'synthetic-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:user,email:'private-owner@example.com'}})}`;
 const context=()=>buildAIFacts({transactions:transactions.map(r=>domainRow<Transaction>(r)),categories:buildCategorySeed(),accounts:accounts.map(r=>domainRow<Account>(r)),month:'2026-10-24',cycleStartDay:24,now:new Date()});
 const request=(body:unknown={month:'2026-10-24',focus:'overview',snapshot:context().snapshot},options:{auth?:boolean;origin?:string;method?:string;path?:string}={})=>new NextRequest(`https://budget.example${options.path??'/api/ai/insights'}`,{method:options.method??'POST',headers:{'content-type':'application/json',origin:options.origin??'https://budget.example',...(options.auth===false?{}:{cookie:`sb-ai-test-auth-token=${session}`})},...(options.method==='GET'?{}:{body:JSON.stringify(body)})});
 return {stats,transactions,context,request,restore(){global.fetch=originalFetch;for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}};
}

test('owner-authenticated summary uses private projections, verified facts, no writes and a per-owner cached result',async()=>{
 const f=fixture();try{
  const first=await POST(f.request());assert.equal(first.status,200,await first.clone().text());const result=await first.json();assert.equal(result.snapshot,f.context().snapshot);assert.equal(result.insights[0].heading,insight.heading);assert.equal(f.stats.provider,1);
  const again=await POST(f.request());assert.equal(again.status,200);assert.equal((await again.json()).cached,true);assert.equal(f.stats.provider,1);
  assert.equal(first.headers.get('cache-control'),'private, no-store');assert.ok(f.stats.reads>=8);
 }finally{f.restore();}
});

test('authentication, same-origin, explicit free-tier setup and body validation all precede provider calls',async()=>{
 const f=fixture();try{
  assert.equal((await POST(f.request(undefined,{auth:false}))).status,401);
  assert.equal((await POST(f.request(undefined,{origin:'https://evil.example'}))).status,403);
  delete process.env.AI_FREE_TIER_CONFIRMED;assert.equal((await GET(f.request(undefined,{method:'GET'}))).status,200);assert.equal((await POST(f.request())).status,503);
  process.env.AI_FREE_TIER_CONFIRMED='gemini-no-billing';assert.equal((await POST(f.request({month:'2026-10-24',focus:'overview',snapshot:f.context().snapshot,model:'paid-model'}))).status,400);
  assert.equal(f.stats.provider,0);
 }finally{f.restore();}
});

test('stale UI and incomplete financial loads fail before an external generation',async()=>{
 const f=fixture();try{
  assert.equal((await POST(f.request({month:'2026-10-24',focus:'food',snapshot:'old-data'}))).status,409);
  f.stats.incomplete=true;assert.equal((await POST(f.request())).status,503);assert.equal(f.stats.provider,0);
 }finally{f.restore();}
});

test('free quota failures use one request without retries or fallback and never expose provider errors',async()=>{
 const f=fixture();try{
  f.stats.status=429;const response=await POST(f.request());assert.equal(response.status,429);const text=await response.text();assert.equal(text.includes('private-upstream-error'),false);assert.equal(text.includes('synthetic-private-key'),false);assert.equal(f.stats.provider,1);assert.equal(response.headers.get('retry-after'),'300');
 }finally{f.restore();}
});

test('hallucinated figures or evidence are rejected instead of displayed as AI results',async()=>{
 const f=fixture();try{f.stats.invalid=true;const response=await POST(f.request());assert.equal(response.status,502);assert.equal((await response.text()).includes('9999'),false);assert.equal(f.stats.provider,1);}finally{f.restore();}
});

test('legacy classifier shares the free gate, authenticated origin and header-only API key',async()=>{
 const f=fixture();try{
  const options={path:'/api/classify'};assert.equal((await classify(f.request({text:'zomato'},{...options,auth:false}))).status,401);
  delete process.env.AI_FREE_TIER_CONFIRMED;assert.equal((await classify(f.request({text:'zomato'},options))).status,501);assert.equal(f.stats.provider,0);
  process.env.AI_FREE_TIER_CONFIRMED='gemini-no-billing';f.stats.classification=true;const response=await classify(f.request({text:'zomato'},options));assert.equal(response.status,200);assert.equal((await response.json()).categoryId,'dining.delivery');assert.equal(f.stats.provider,1);
 }finally{f.restore();}
});

test('concurrent requests share a generation; new snapshots respect the best-effort per-user request limit',async()=>{
 const f=fixture();try{
  const pair=await Promise.all([POST(f.request()),POST(f.request())]);assert.equal(pair.every(r=>r.status===200),true);assert.equal(f.stats.provider,1);
  for(const focus of ['food','changes'])assert.equal((await POST(f.request({month:'2026-10-24',focus,snapshot:f.context().snapshot}))).status,200);
  assert.equal(f.stats.provider,3);f.transactions[0]!.amount++;
  const limited=await POST(f.request());assert.equal(limited.status,429);assert.equal(f.stats.provider,3);assert.equal((await limited.json()).code,'limit');
 }finally{f.restore();}
});

test('one owner never receives another owner’s cached interpretation for identical financial facts',async()=>{
 const first=fixture();let snapshot:string;try{snapshot=first.context().snapshot;assert.equal((await POST(first.request())).status,200);}finally{first.restore();}
 const second=fixture();try{assert.equal(second.context().snapshot,snapshot!);const response=await POST(second.request());assert.equal(response.status,200);assert.equal(second.stats.provider,1);assert.notEqual((await response.json()).cached,true);}finally{second.restore();}
});
