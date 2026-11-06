import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {tryAutomaticPayment} from '@/lib/gmail/auto-payment';
import {parseAlert,type Alert,type MailPart} from '@/lib/gmail/alerts';
const user='11111111-1111-4111-8111-111111111111';
const accounts=[{id:'bank',name:'HDFC',hint:'1234',type:'BANK' as const,isActive:true},{id:'axis',name:'Axis',hint:'5678',type:'BANK' as const,isActive:true},{id:'card',name:'HSBC',hint:'9012',type:'CREDIT_CARD' as const,isActive:true}];
const peerBody='Rs.300.00 is debited from your HDFC Bank account ending 1234 towards EXAMPLE OWNER on 04-11-2026. UPI transaction reference no.: 123456789012';
function mail(body=peerBody,authenticated=true):{payload:MailPart}{return {payload:{mimeType:'text/plain',headers:[{name:'From',value:'alerts@hdfcbank.bank.in'},{name:'Subject',value:'Account update'},{name:'Authentication-Results',value:`mx.google.com; dmarc=${authenticated?'pass':'fail'} header.from=hdfcbank.bank.in`}],body:{data:Buffer.from(body).toString('base64url')}}};}
const peer={...parseAlert('alerts@hdfcbank.bank.in','Account update',peerBody)!,accountId:'bank'};
const credit:Alert={...peer,bank:'Axis',tail:'5678',accountId:'axis',direction:'credit',creditKind:'unknown',merchant:'EXAMPLE OWNER'};
const base={userId:user,messageId:'current',alert:credit,authenticated:true,startDate:'2026-10-01',accounts,selfNames:['Example Owner'],aliases:{},deadline:Date.now()+120000,fetchMail:async()=>mail()};
function harness(peers:Record<string,unknown>[]=[],transaction:unknown=null,total=peers.length){
 const calls:Array<{path:string;method:string;body:any}>=[];
 const db=createClient('https://database.example','synthetic',{auth:{persistSession:false},global:{fetch:async(input,init)=>{
  const url=new URL(String(input)),method=init?.method??'GET',body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({path:url.pathname,method,body});
  if(url.pathname.endsWith('/gmail_messages')&&url.searchParams.get('select')==='transaction_id')return Response.json({transaction_id:'canonical-peer'});
  if(url.pathname.endsWith('/gmail_messages')&&method==='PATCH'){assert.deepEqual(body,{parser_version:0});return Response.json(null);}
  if(url.pathname.endsWith('/gmail_messages')){assert.equal(url.searchParams.get('user_id'),`eq.${user}`);assert.equal(url.searchParams.get('candidate->>amount'),`eq.${credit.amount}`);return Response.json(peers,{headers:{'content-range':`0-${Math.max(0,peers.length-1)}/${total}`}});}
  if(url.pathname.endsWith('/transactions')){assert.equal(url.searchParams.get('user_id'),`eq.${user}`);return Response.json(transaction);}
  if(url.pathname.endsWith('/rpc/gmail_commit'))return Response.json('logged');
  if(url.pathname.endsWith('/rpc/gmail_match_existing'))return Response.json('matched');
  throw Error('Unexpected request '+url.pathname);
 }}});
 return {db,calls};
}
test('policy income commit uses owned bank, no refund flag, no duplicate bypass or tracking debts',async()=>{
 const h=harness(),alert={...credit,merchant:'EXAMPLE FRIEND (VPA: ******@bank)'};
 assert.equal(await tryAutomaticPayment({...base,...h,alert}),'logged');
 const write=h.calls.find(c=>c.method==='POST')!;
 assert.deepEqual(write.body,{p_user:user,p_message:'current',p_type:'INCOME',p_account:'axis',p_destination:null,p_category:null,p_refund:false,p_reviewed:true,p_allow_duplicate:false});
});
test('fresh authenticated opposite bank legs establish the endpoints',async()=>{
 const h=harness([{message_id:'peer',candidate:peer,status:'review'}]);
 assert.equal(await tryAutomaticPayment({...base,...h}),'logged');
 assert.equal(h.calls.find(c=>c.path.endsWith('/rpc/gmail_commit'))!.body.p_message,'peer');
 assert.equal(h.calls.find(c=>c.path.endsWith('/rpc/gmail_commit'))!.body.p_type,'TRANSFER');assert.equal(h.calls.find(c=>c.path.endsWith('/rpc/gmail_commit'))!.body.p_account,'bank');assert.equal(h.calls.find(c=>c.path.endsWith('/rpc/gmail_commit'))!.body.p_destination,'axis');
});
test('missing/competing/changed or unauthenticated companion evidence never creates a self-transfer or income',async()=>{
 for(const peers of [[],[{message_id:'one',candidate:peer},{message_id:'two',candidate:peer}]]){const h=harness(peers);assert.equal(await tryAutomaticPayment({...base,...h}),undefined);assert.equal(h.calls.some(c=>c.method==='POST'),false);}
 const partial=harness([{message_id:'peer',candidate:peer,status:'review'}],null,2);assert.equal(await tryAutomaticPayment({...base,...partial}),undefined);assert.equal(partial.calls.some(c=>c.method==='POST'),false);
 for(const fetchMail of [async()=>mail(peerBody,false),async()=>mail(peerBody.replace('300.00','301.00'))]){const h=harness([{message_id:'peer',candidate:peer,status:'review'}]);assert.equal(await tryAutomaticPayment({...base,...h,fetchMail}),undefined);assert.equal(h.calls.some(c=>c.method==='POST'),false);}
});
test('existing transfer peer links the new source and preserves its financial fields',async()=>{
 const transaction={id:'saved',type:'TRANSFER',amount:credit.amount,account_id:'bank',to_account_id:'axis',date:'2026-11-04'};
 const h=harness([{message_id:'peer',candidate:peer,status:'logged',transaction_id:'saved'}],transaction);
 assert.equal(await tryAutomaticPayment({...base,...h}),'matched');assert.equal(h.calls.at(-1)!.path,'/rest/v1/rpc/gmail_match_existing');assert.equal(h.calls.at(-1)!.body.p_transaction,'saved');assert.equal(transaction.type,'TRANSFER');
 const wrong=harness([{message_id:'peer',candidate:peer,status:'logged',transaction_id:'saved'}],{...transaction,type:'EXPENSE'});
 assert.equal(await tryAutomaticPayment({...base,...wrong}),undefined);assert.equal(wrong.calls.some(c=>c.method==='POST'),false);
});
test('auth, date, account and posted-purpose gates precede every database access',async()=>{
 for(const over of [{authenticated:false},{alert:{...credit,date:'2099-01-01'}},{alert:{...credit,date:'2020-01-01'}},{alert:{...credit,accountId:'unknown'}},{alert:{...credit,creditKind:'refund' as const}},{alert:{...credit,refundStatus:'initiated' as const}}]){const h=harness();assert.equal(await tryAutomaticPayment({...base,...h,...over}),undefined);assert.equal(h.calls.length,0);}
});
test('CRED receipt plus verified bank debit makes a card repayment, not spending or income',async()=>{
 const body=peerBody.replace('EXAMPLE OWNER','CRED Club'),debit={...parseAlert('alerts@hdfcbank.bank.in','Account update',body)!,accountId:'bank'};
 const card:Alert={...credit,instrument:'credit_card',bank:'HSBC',tail:'9012',accountId:'card',merchant:'HSBC card repayment via CRED',creditKind:'repayment',reference:undefined,providerReference:'CRED:ORDER123456'};
 const h=harness([{message_id:'peer',candidate:debit,status:'review'}]);assert.equal(await tryAutomaticPayment({...base,...h,alert:card,fetchMail:async()=>mail(body)}),'logged');assert.equal(h.calls.find(c=>c.path.endsWith('/rpc/gmail_commit'))!.body.p_type,'TRANSFER');assert.equal(h.calls.find(c=>c.path.endsWith('/rpc/gmail_commit'))!.body.p_destination,'card');
});
