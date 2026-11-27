import assert from 'node:assert/strict';
import test from 'node:test';
import {loadNotificationDatabase} from '@/lib/notifications/data';

test('alert checks load every owner-scoped row even with capped pages and reject incomplete snapshots',async()=>{
 for(const truncated of [false,true]){
  const calls:{table:string;filters:string[][];range:number[]}[]=[];
  const source=Array.from({length:1201},(_,i)=>({id:String(i).padStart(5,'0'),user_id:'owner',amount:100,type:'EXPENSE',date:'2026-11-25T00:00:00',created_at:'2026-11-25T00:00:00'}));
  const client={from(table:string){const filters:string[][]=[];let range=[0,499];const q={select(){return q;},eq(a:string,b:string){filters.push([a,b]);return q;},order(){return q;},range(from:number,to:number){range=[from,to];return q;},single(){return q;},then(resolve:(x:unknown)=>unknown){calls.push({table,filters,range});const rows=table==='transactions'?source.slice(range[0],truncated&&range[0]!>0?range[0]:range[0]!+200):[];return Promise.resolve(resolve({data:table==='profiles'?{id:'owner',name:'Owner'}:rows,count:table==='transactions'?source.length:0,error:null}));}};return q;}};
  if(truncated)await assert.rejects(loadNotificationDatabase(client as never,'owner'),/incomplete/);
  else{const data=await loadNotificationDatabase(client as never,'owner');assert.equal(data.transactions.length,1201);assert.equal(data.transactions[1200]?.createdAt,'2026-11-25T00:00:00');assert.ok(data.transactions.every(t=>!('user_id' in t)));}
  assert.ok(calls.every(c=>c.filters.some(([key,value])=>key===(c.table==='profiles'?'id':'user_id')&&value==='owner')));
 }
});
