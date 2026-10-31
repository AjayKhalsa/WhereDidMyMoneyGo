import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';
import {completeLoad} from '@/lib/data/complete-load';
import {domainRow} from '@/lib/gmail/learning-data';
import type {Account,Category,IncomeSource,Transaction} from '@/lib/domain/types';
import {monthKey,monthKeyToDate,toDateInputValue} from '@/lib/domain/dates';
import {buildAIFacts} from './facts';

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
export async function loadAIContext(session:AISession,month:string,now:Date){
 const load=(table:string)=>completeLoad<Record<string,unknown>>((from,to)=>session.client.from(table).select('*',{count:'exact'}).eq('user_id',session.userId).order('id').range(from,to),row=>String(row.id));
 const [tx,categories,accounts,sources]=await Promise.all([load('transactions'),load('categories'),load('accounts'),load('income_sources')]);
 const incomes=sources.data.map(row=>domainRow<IncomeSource>(row));
 const cycleStartDay=incomes.filter(s=>s.isActive&&s.recurring).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0]?.dayOfMonth??1;
 const date=monthKeyToDate(month);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(month)||toDateInputValue(date)!==month||monthKey(date,cycleStartDay)!==month)throw new AIRequestError(400,'period','Choose a valid pay cycle.');
 return buildAIFacts({transactions:tx.data.map(row=>domainRow<Transaction>(row)),categories:categories.data.map(row=>domainRow<Category>(row)),accounts:accounts.data.map(row=>domainRow<Account>(row)),month,cycleStartDay,now});
}
