"use client";

import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {useFinance} from '@/lib/hooks/use-finance';
import {buildIntegratedContext,applyInsightNarratives} from '@/lib/ai/integrated-context';
import {validateAIInsights,validateNarratives,type AIResult,type AINarrative} from '@/lib/ai/facts';
import type {Insight} from '@/lib/engine/insights';
import {InfoButton} from '@/components/ui/info-button';

type Analysis={insights:Insight[];narratives:Map<string,AINarrative>;source:'ai'|'patterns';loading:boolean;reason:string|null};
const Context=createContext<Analysis|null>(null);
// Memory only, owner scoped and bounded. Never store financial summaries in browser storage.
const cache=new Map<string,{until:number;result:AIResult}>();
const unavailable=new Map<string,{until:number;reason:string}>();

export function InsightAnalysisProvider({children}:{children:ReactNode}){
 const finance=useFinance(),path=usePathname();
 const {db,month,now,cycleStartDay,insights,budget,score,personalTransactions}=finance;
 const active=finance.status==='ready'&&(path==='/'||path==='/insights'||path==='/budgets');
 const context=useMemo(()=>active&&db?buildIntegratedContext(db,month,now,cycleStartDay,{insights,budget,score}):null,[active,db,month,now,cycleStartDay,insights,budget,score]);
 const owner=db?.profile.id??'',snapshot=context?.snapshot??'',key=`${owner}:${snapshot}`;
 const [response,setResponse]=useState<{key:string;result:AIResult}|null>(null);
 const [request,setRequest]=useState<{key:string;loading:boolean;reason:string|null}>({key:'',loading:false,reason:null});
 useEffect(()=>{
  if(!active||!context||!db||db.profile.isDemo||!process.env.NEXT_PUBLIC_SUPABASE_URL||!context.facts.some(f=>f.transactionIds.length))return;
  const prior=cache.get(key);
  if(prior&&prior.until>Date.now()){setResponse({key,result:prior.result});return;}
  const held=unavailable.get(owner);
  if(held&&held.until>Date.now()){setRequest({key,loading:false,reason:held.reason});return;}
  const controller=new AbortController();let current=true;
  const timer=setTimeout(async()=>{
   setRequest({key,loading:true,reason:null});
   try{
    const res=await fetch('/api/ai/insights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({month,snapshot,focus:'overview',mode:'integrated'}),signal:controller.signal});
    const data=await res.json();
    if(!res.ok){const error=new Error(data.error??'Enhanced analysis is unavailable.') as Error&{retryAfter?:number};error.retryAfter=Number(res.headers.get('Retry-After'))||(res.status===503?300:30);throw error;}
    if(data.snapshot!==snapshot||data.focus!=='overview')throw new Error('Analysis no longer matches this cycle.');
    const result:AIResult={...data,insights:validateAIInsights({insights:data.insights},context),narratives:validateNarratives({narratives:data.narratives},context)};
    if(!current)return;
    cache.set(key,{until:Date.now()+30*60000,result});if(cache.size>24)cache.delete(cache.keys().next().value!);
    unavailable.delete(owner);setResponse({key,result});setRequest({key,loading:false,reason:null});
   }catch(error){
    if(!current||controller.signal.aborted)return;
    const reason=error instanceof Error?error.message:'Enhanced analysis is unavailable.';
    const delay=error instanceof Error?(error as Error&{retryAfter?:number}).retryAfter??30:30;
    unavailable.set(owner,{until:Date.now()+Math.max(30,Math.min(delay,3600))*1000,reason});if(unavailable.size>24)unavailable.delete(unavailable.keys().next().value!);
    setRequest({key,loading:false,reason});
   }
  },350);
  return()=>{current=false;clearTimeout(timer);controller.abort();};
  // The snapshot includes every supporting figure and target. Minute ticks with
  // identical facts must not cancel/restart a request or consume more quota.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[active,key,owner,snapshot,month]);
 const result=response?.key===key?response.result:null;
 const value=useMemo<Analysis>(()=>({
  insights:context?applyInsightNarratives(insights,result,context,personalTransactions):insights,
  narratives:new Map(result?.narratives?.map(n=>[context?.targets?.find(t=>t.id===n.targetId)?.key??'',n])),
  source:result?'ai':'patterns',loading:request.key===key&&request.loading,reason:request.key===key?request.reason:null,
 }),[context,insights,result,personalTransactions,request,key]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useInsightAnalysis(){return useContext(Context);}
export function useInsightNarrative(key:string){return useContext(Context)?.narratives.get(key);}
export function InsightsSource(){
 const analysis=useInsightAnalysis();
 return <InfoButton title="About your insights"><p>{analysis?.source==='ai'?'AI connects your recorded evidence and explains the existing insights.':'Your insights currently use recorded spending patterns.'}</p><p>The app calculates every amount, score and forecast. Supporting transactions remain available. AI explanations load automatically when suitable private processing is configured; unavailable, invalid or out-of-date results leave the original insights in place.</p>{analysis?.loading&&<p>Enhanced explanations are loading.</p>}{analysis?.reason&&<p>{analysis.reason}</p>}<p>Summary figures go to the configured provider. Raw emails, payee identities, notes and account numbers stay out of the request. No financial records are changed.</p></InfoButton>;
}
