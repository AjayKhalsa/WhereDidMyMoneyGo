import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {PUBLIC_INFORMATION_PATHS,isPublicInformationPath} from '@/lib/public/branding';
const require=createRequire(import.meta.url),hook=registerHooks({resolve(specifier,context,next){return next(specifier==='next/server'?pathToFileURL(require.resolve('next/server.js')).href:specifier,context);}});
const {NextRequest}=await import('next/server.js');
const {middleware}=await import('@/middleware');
const previous={...process.env},oldFetch=globalThis.fetch;
after(()=>{hook.deregister();globalThis.fetch=oldFetch;process.env=previous;});

test('Google branding documents are public without authentication or database access; private screens stay gated',async()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://branding-fixture.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic';
 let fetches=0;globalThis.fetch=async()=>{fetches++;throw Error('Public document must not request private data');};
 for(const path of PUBLIC_INFORMATION_PATHS){
  assert.ok(isPublicInformationPath(path));
  const response=await middleware(new NextRequest('https://budget.example'+path));
  assert.equal(response.headers.get('x-middleware-next'),'1');assert.equal(response.headers.get('location'),null);
 }
 assert.equal(fetches,0);
 for(const path of ['/','/money','/settings','/transactions','/notifications','/privacy/export','/about/private','/terms-of-service','/api/transactions']){
  assert.equal(isPublicInformationPath(path),false);
  const response=await middleware(new NextRequest('https://budget.example'+path));
  assert.equal(response.status,307);assert.equal(new URL(response.headers.get('location')!).pathname,'/login');
 }
 assert.equal(fetches,0,'Unauthenticated requests cannot read a ledger');
});
