import type { NextRequest } from 'next/server';
import { checkOrigin,failure,GmailError,json,userFor } from '@/lib/gmail/server';
import { backfillReport,scanBackfill } from '@/lib/gmail/backfill';
export const maxDuration=60;
export async function GET(request:NextRequest){try{const session=json({}),user=await userFor(request,session),response=json(await backfillReport(user.id));for(const cookie of session.cookies.getAll())response.cookies.set(cookie);return response;}catch(e){return failure(e);}}
export async function POST(request:NextRequest){try{checkOrigin(request);const session=json({}),user=await userFor(request,session),body=await request.json();if(body.start!==undefined&&(typeof body.start!=='string'||typeof body.end!=='string'))throw new GmailError('Choose a date range.');const response=json(await scanBackfill(user.id,body.start?{start:body.start,end:body.end}:undefined));for(const cookie of session.cookies.getAll())response.cookies.set(cookie);return response;}catch(e){return failure(e);}}
