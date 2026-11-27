import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {after} from 'node:test';
const require=createRequire(import.meta.url),hook=registerHooks({resolve(specifier,context,next){return next(specifier==='next/server'?pathToFileURL(require.resolve('next/server.js')).href:specifier,context);}});after(()=>hook.deregister());
const {dispatchAlerts}=await import('@/lib/notifications/dispatch');
const {DEFAULT_NOTIFICATION_PREFERENCES:defaults}=await import('@/lib/notifications/model');
import type {MoneyNotification} from '@/lib/notifications/model';
const alert:MoneyNotification={key:'bill:subscription:today',kind:'bill',title:'Private subscription',body:'₹1,999 private detail',priority:90,tone:'neutral',url:'/money#bills',transactionIds:[]};
const now=new Date('2026-11-27T08:00:00Z');
function fixture(){
 const operations:{table:string;action:string;data?:unknown;filters:string[][]}[]=[],rpcs:{name:string;args:Record<string,unknown>}[]=[];
 const client={from(table:string){const op={table,action:'select',data:undefined as unknown,filters:[] as string[][]};const q={select(){return q;},eq(a:string,b:string){op.filters.push([a,b]);return q;},limit(){return q;},update(data:unknown){op.action='update';op.data=data;return q;},delete(){op.action='delete';return q;},then(resolve:(result:unknown)=>unknown){operations.push(op);return Promise.resolve(resolve({error:null,data:op.action==='select'?[{endpoint_hash:'fixture-device',subscription:'encrypted'}]:null}));}};return q;},async rpc(name:string,args:Record<string,unknown>){rpcs.push({name,args});return{error:null,data:name==='claim_notification_dispatch'?'lease-ticket':true};}};
 const status={preferences:defaults,states:{},sync:{state:'ok' as const},lastCheckedAt:null};
 return {client:client as unknown as Parameters<typeof dispatchAlerts>[0],operations,rpcs,status};
}
test('delivery acceptance marks the claimed group and owner device without claiming a read receipt',async()=>{
 const f=fixture(),payloads:unknown[]=[];
 const count=await dispatchAlerts(f.client,'owner',[alert],f.status,now,{configured:()=>true,decode:(_value,user)=>{assert.equal(user,'owner');return{endpoint:'https://fcm.googleapis.com/fixture',keys:{p256dh:'synthetic',auth:'synthetic'}};},send:async(_s,p)=>{payloads.push(p);}});
 assert.equal(count,1);assert.doesNotMatch(JSON.stringify(payloads),/1,999|Private subscription/);assert.equal(f.rpcs.at(-1)?.args.p_sent,true);assert.ok(f.operations.some(o=>o.action==='update'&&JSON.stringify(o.data).includes('last_sent_at')));assert.ok(f.operations.every(o=>o.filters.some(([k,v])=>k==='user_id'&&v==='owner')));
});
test('temporary delivery failure remains retryable while expired endpoints are removed',async()=>{
 for(const code of [503,410]){
  const f=fixture();const count=await dispatchAlerts(f.client,'owner',[alert],f.status,now,{configured:()=>true,decode:()=>({endpoint:'https://fcm.googleapis.com/fixture',keys:{p256dh:'synthetic',auth:'synthetic'}}),send:async()=>{throw{statusCode:code};}});
  assert.equal(count,0);assert.equal(f.rpcs.at(-1)?.args.p_sent,false);assert.ok(f.operations.some(o=>code===410?o.action==='delete':o.action==='update'&&JSON.stringify(o.data).includes('delivery_failed')));
 }
});
test('quiet hours, read state and the daily claim prevent accidental sends',async()=>{
 for(const mode of ['quiet','read','claimed']){
  const f=fixture(),transport={configured:()=>true,decode:()=>{throw Error('must not decode');},send:async()=>{assert.fail('must not send');}};
  if(mode==='read')f.status.states={[alert.key]:{key:alert.key,readAt:'now',dismissedAt:null,pushedAt:null,updatedAt:'now'}};
  if(mode==='claimed')f.client.rpc=(async()=>({error:null,data:null})) as unknown as typeof f.client.rpc;
  assert.equal(await dispatchAlerts(f.client,'owner',[alert],f.status,mode==='quiet'?new Date('2026-11-27T20:00:00Z'):now,transport),0);
  if(mode==='quiet')assert.equal(f.operations.length,0);
  if(mode==='read')assert.equal(f.rpcs.length,0);
 }
});
