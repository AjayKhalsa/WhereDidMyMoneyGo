import {projectMoneyLinks} from '@/lib/engine/money-links';
import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';
import {completeLoad} from '@/lib/data/complete-load';
import {domainRow} from '@/lib/gmail/learning-data';
import type {Account,Category,IncomeSource,Transaction,MoneyLink,Database,UserProfile,TransactionContext} from '@/lib/domain/types';
import {monthKey,monthKeyToDate,toDateInputValue} from '@/lib/domain/dates';
import {buildAIFacts} from './facts';
import {buildIntegratedContext} from './integrated-context';

export class AIRequestError extends Error {constructor(public status:number,public code:string,message:string,public retryAfter?:number){super(message);}}
export function aiJSON(data:unknown,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}
export async function aiSession(request:NextRequest){
 const response=aiJSON({});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new AIRequestError(401,'sign_in','Sign in to your cloud account to use AI insights.');
 const client=createServerClient(url,key,{cookies:{getAll:()=>request.cookies.getAll(),setAll:values=>values.forEach(c=>response.cookies.set(c.name,c.value,c.options))}});
 const {data,error}=await client.auth.getUser();
 if(error||!data.user)throw new AIRequestError(401,'sign_in','Please sign in again.');
 return {client,userId:data.user.id,response};
}
export type AISession=Awaited<ReturnType<typeof aiSession>>;
export function copyAICookies(response:NextResponse,session?:AISession){for(const c of session?.response.cookies.getAll()??[])response.cookies.set(c);return response;}
export function aiFailure(error:unknown,session?:AISession){
 const known=error instanceof AIRequestError?error:new AIRequestError(503,'unavailable','AI insights are temporarily unavailable. Your ledger is unchanged.');
 const response=copyAICookies(aiJSON({error:known.message,code:known.code},known.status),session);
 if(known.retryAfter)response.headers.set('Retry-After',String(known.retryAfter));return response;
}
export function aiOrigin(request:NextRequest){if(request.headers.get('origin')!==request.nextUrl.origin)throw new AIRequestError(403,'origin','Request origin rejected.');}

/** Owner-scoped, RLS-authenticated counted loads. No service-role key or Gmail
 * connection is needed. Transaction contexts/notes never enter provider facts. */
export async function loadAIContext(session:AISession,month:string,now:Date,integrated=false){
 if(integrated)return loadIntegratedContext(session,month,now);
 const load=(table:string)=>completeLoad<Record<string,unknown>>((from,to)=>session.client.from(table).select('*',{count:'exact'}).eq('user_id',session.userId).order('id').range(from,to),row=>String(row.id));
 const [tx,categories,accounts,sources,links]=await Promise.all([load('transactions'),load('categories'),load('accounts'),load('income_sources'),load('money_links')]);
 const incomes=sources.data.map(row=>domainRow<IncomeSource>(row));
 const cycleStartDay=incomes.filter(s=>s.isActive&&s.recurring).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0]?.dayOfMonth??1;
 const date=monthKeyToDate(month);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(month)||toDateInputValue(date)!==month||monthKey(date,cycleStartDay)!==month)throw new AIRequestError(400,'period','Choose a valid pay cycle.');
 return buildAIFacts({transactions:projectMoneyLinks({transactions:tx.data.map(row=>domainRow<Transaction>(row)),moneyLinks:links.data.map(row=>domainRow<MoneyLink>(row))},now).transactions,categories:categories.data.map(row=>domainRow<Category>(row)),accounts:accounts.data.map(row=>domainRow<Account>(row)),month,cycleStartDay,now});
}

async function loadIntegratedContext(session:AISession,month:string,now:Date){
 const mappings=[['transactions','transactions'],['categories','categories'],['accounts','accounts'],['income_sources','incomeSources'],['money_links','moneyLinks'],['investments','investments'],['recurring','recurring'],['goals','goals'],['credit_cards','creditCards'],['people','people'],['splits','splits']] as const;
 const load=(table:string,keys=['id'])=>completeLoad<Record<string,unknown>>((from,to)=>{
  let query=session.client.from(table).select('*',{count:'exact'}).eq('user_id',session.userId);
  for(const key of keys)query=query.order(key);
  return query.range(from,to);
 },row=>keys.map(k=>String(row[k])).join('|'));
 const [profile,collections,contexts]=await Promise.all([
  session.client.from('profiles').select('*').eq('id',session.userId).maybeSingle(),
  Promise.all(mappings.map(async([table,key])=>[key,(await load(table)).data.map(row=>domainRow(row))] as const)),
  load('transaction_contexts',['transaction_id','type','value']),
 ]);
 if(profile.error||!profile.data)throw new AIRequestError(503,'history','Your profile could not be loaded. Recorded-pattern insights remain available.');
 const db={...Object.fromEntries(collections),profile:domainRow<UserProfile>(profile.data),rules:[]} as unknown as Database;
 const byId=new Map<string,TransactionContext[]>();
 for(const c of contexts.data){const id=String(c.transaction_id);const list=byId.get(id)??[];list.push({type:c.type,value:c.value} as TransactionContext);byId.set(id,list);}
 db.transactions=db.transactions.map(t=>({...t,contexts:byId.get(t.id)??[]}));
 const cycleStartDay=db.incomeSources.filter(s=>s.isActive&&s.recurring).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0]?.dayOfMonth??1;
 const date=monthKeyToDate(month);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(month)||toDateInputValue(date)!==month||monthKey(date,cycleStartDay)!==month)throw new AIRequestError(400,'period','Choose a valid pay cycle.');
 return buildIntegratedContext(db,month,now,cycleStartDay);
}
