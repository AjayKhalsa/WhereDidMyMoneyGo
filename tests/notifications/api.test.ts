import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {DEFAULT_NOTIFICATION_PREFERENCES as preferences} from '@/lib/notifications/model';
const require=createRequire(import.meta.url),hook=registerHooks({resolve(specifier,context,next){return next(specifier==='next/server'?pathToFileURL(require.resolve('next/server.js')).href:specifier,context);}});
const {NextRequest}=await import('next/server.js');
const {GET,POST}=await import('@/app/api/notifications/route');
const {GET:cron}=await import('@/app/api/cron/notifications/route');
const {middleware}=await import('@/middleware');
const oldFetch=globalThis.fetch,oldEnv={...process.env};after(()=>{hook.deregister();globalThis.fetch=oldFetch;process.env=oldEnv;});
const user='11111111-1111-4111-8111-111111111111';
const requests:{url:URL;body:Record<string,unknown>|null;method:string}[]=[];
const session={access_token:'fixture.'+Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user}};
function request(body:unknown,withSession=true){return new NextRequest('https://budget.example/api/notifications',{method:'POST',headers:{origin:'https://budget.example',...(withSession?{cookie:'sb-fixture-auth-token=base64-'+Buffer.from(JSON.stringify(session)).toString('base64url')}:{})},body:typeof body==='string'?body:JSON.stringify(body)});}
test('API authenticates, validates, scopes changes to signed-in owner and never exposes subscription tokens',async()=>{
 process.env.APP_ORIGIN='https://budget.example';process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-anon';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service';delete process.env.VAPID_PUBLIC_KEY;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),method=init?.method??'GET',body=init?.body?JSON.parse(String(init.body)):null;requests.push({url,method,body});
  let result:unknown=[];
  if(url.pathname==='/auth/v1/user')result={id:user,aud:'authenticated',email:'fixture@example.test'};
  else if(url.pathname.includes('/rpc/mark_notification_state'))result=[{event_key:'bill:a',read_at:'2026-11-27T08:00:00Z',dismissed_at:null,pushed_at:null,updated_at:'2026-11-27T08:00:00Z'}];
  else if(url.pathname.includes('/rpc/notification_sync_status'))result={state:'ok'};
  else if(url.pathname.endsWith('/notification_preferences')&&method==='GET')result=null;
  else if(url.pathname.endsWith('/push_subscriptions')&&method==='GET')result=[{endpoint_hash:'a'.repeat(64),device_name:'iPhone',last_sent_at:null,last_test_at:null,delivery_failed:false}];
  return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json','content-range':'*/0'}});
 };
 for(const [path,handler] of [['/api/notifications',GET],['/api/cron/notifications',cron]] as const){const incoming=new NextRequest('https://budget.example'+path);const gate=await middleware(incoming);assert.equal(gate.headers.get('x-middleware-next'),'1','handler must receive background requests without login redirects');const result=await handler(incoming);assert.equal(result.status,401);assert.equal(result.headers.get('content-type')?.split(';')[0],'application/json');}
 assert.equal((await POST(request({action:'preferences',preferences},false))).status,401);
 const bad=new NextRequest('https://budget.example/api/notifications',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'});assert.equal((await POST(bad)).status,403);
 for(const body of ['invalid-json',{action:'preferences',preferences:{}},{action:'read',keys:['invalid']},{action:'read',keys:Array(51).fill('bill:a')},{action:'pushed',keys:['bill:a']}])assert.ok((await POST(request(body))).status>=400);
 assert.equal((await POST(request({action:'preferences',preferences,user_id:'another-user'}))).status,200);
 const write=requests.find(r=>r.url.pathname.endsWith('/notification_preferences')&&r.method==='POST')!;assert.equal(write.body?.user_id,user);assert.deepEqual(write.body?.settings,preferences);
 const marked=await POST(request({action:'read',keys:['bill:a'],user_id:'another-user'}));assert.equal(marked.status,200);assert.equal(requests.find(r=>r.url.pathname.includes('/rpc/mark_notification_state'))?.body?.p_user,user);
 assert.equal((await POST(request({action:'remove-device',hash:'a'.repeat(64)}))).status,200);const removal=requests.find(r=>r.method==='DELETE')!;assert.equal(removal.url.searchParams.get('user_id'),'eq.'+user);
 const get=new NextRequest('https://budget.example/api/notifications',{headers:{cookie:request({},true).headers.get('cookie')!}});const response=await GET(get);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');const payload=await response.json();assert.equal(payload.preferences.bills,true);assert.doesNotMatch(JSON.stringify(payload),/fixture-refresh|synthetic-service|subscription|endpoint"/);
 const deviceRead=requests.find(r=>r.method==='GET'&&r.url.pathname.endsWith('/push_subscriptions'))!;assert.equal(deviceRead.url.searchParams.get('user_id'),'eq.'+user);assert.doesNotMatch(deviceRead.url.searchParams.get('select')!,/subscription/);
 process.env.CRON_SECRET='fixture-cron';assert.equal((await cron(new NextRequest('https://budget.example/api/cron/notifications'))).status,401);
});
