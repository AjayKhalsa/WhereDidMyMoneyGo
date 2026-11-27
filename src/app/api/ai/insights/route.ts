import type {NextRequest} from 'next/server';
import {AI_FOCUS,type AIFocus} from '@/lib/ai/facts';
import {AI_MODEL,aiEnabled} from '@/lib/ai/policy';
import {aiJSON,aiFailure,aiOrigin,aiSession,copyAICookies,loadAIContext,AIRequestError,type AISession} from '@/lib/ai/server';
import {generateAIInsights} from '@/lib/ai/gemini';
export const maxDuration=30;

export async function GET(request:NextRequest){let session:AISession|undefined;try{session=await aiSession(request);return copyAICookies(aiJSON({configured:aiEnabled(),model:AI_MODEL}),session);}catch(error){return aiFailure(error,session);}}
export async function POST(request:NextRequest){let session:AISession|undefined;try{
 aiOrigin(request);session=await aiSession(request);
 if(!aiEnabled())throw new AIRequestError(503,'privacy_setup','Private AI processing is not configured. Recorded-pattern insights remain available.');
 if(Number(request.headers.get('content-length')??0)>2048)throw new AIRequestError(400,'request','Invalid AI request.');
 const raw=await request.text();if(raw.length>2048)throw new AIRequestError(400,'request','Invalid AI request.');
 let body:any;try{body=JSON.parse(raw);}catch{throw new AIRequestError(400,'request','Invalid AI request.');}
 if(!body||Array.isArray(body)||typeof body.month!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(body.month)||typeof body.snapshot!=='string'||body.snapshot.length>40||!AI_FOCUS.includes(body.focus)||body.mode!==undefined&&body.mode!=='integrated'||Object.keys(body).some(k=>!['month','snapshot','focus','mode'].includes(k)))throw new AIRequestError(400,'request','Invalid AI request.');
 const context=await loadAIContext(session,body.month,new Date(),body.mode==='integrated');
 if(context.snapshot!==body.snapshot)throw new AIRequestError(409,'stale','Your ledger changed. Refresh the app before generating new insights.');
 if(!context.facts.some(f=>f.transactionIds.length))throw new AIRequestError(400,'history','Record some money activity before generating insights.');
 const result=await generateAIInsights(session.userId,context,body.focus as AIFocus,request.signal);
 return copyAICookies(aiJSON(result),session);
}catch(error){return aiFailure(error,session);}}
