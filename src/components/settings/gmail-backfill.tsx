"use client";
import { useEffect,useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { formatMoney } from '@/lib/domain/money';
interface Report {
 run:{start_date:string;end_date:string;status:string;discovery_complete:boolean;last_error?:string}|null;
 summary?:{discovered:number;processed:number;matched:number;proposed:number;needsReview:number;ignored:number;skipped:number;failed:number;pending:number;imported:number;complete:boolean};
 items:{message_id:string;status:string;reason:string;candidate?:{merchant:string;amount:number;date:string};subscription?:{status:string}}[];
 subscriptions:{transactionId:string;merchant:string;status:string;expectedAmount:number;actualAmount:number}[];
 patterns?:{merchant:string;amountChanged:boolean}[];
 more?:boolean;
}
async function request(method='GET',body?:unknown):Promise<Report>{const r=await fetch('/api/gmail/backfill',{method,cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error||'Could not load historical preview.');return data;}
export function GmailBackfill(){
 const [report,setReport]=useState<Report>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [start,setStart]=useState('2026-07-18'),[end,setEnd]=useState('2026-10-18');
 useEffect(()=>{void request().then(r=>{setReport(r);if(r.run){setStart(r.run.start_date);setEnd(r.run.end_date);}}).catch(e=>setError(e.message));},[]);
 async function scan(){setBusy(true);setError('');try{for(let i=0;i<6;i++){const result=await request('POST',i===0&&(!report?.run||report.run.status==='complete')?{start,end,refresh:true}:{});setReport(result);if(!result.more)break;}}catch(e){setError(e instanceof Error?e.message:'Preview interrupted.');}finally{setBusy(false);}}
 function download(){if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='gmail-backfill-preview.json';a.click();URL.revokeObjectURL(url);}
 const summary=report?.summary;
 return <div className="space-y-3 border-t border-line pt-4">
  <h3 className="text-sm font-medium">Historical Gmail preview</h3>
  <p className="text-xs text-ink-secondary">Already recorded emails count as matched and need no action. Only unresolved cases appear below. Possible matches still need confirmation when a shared bank reference is missing.</p>
  <p className="text-xs text-ink-secondary">Scan supported bank alerts before your connection start date. This is a dry run: no ledger imports, category edits or subscription links are saved. Existing dismissals stay dismissed. Statements remain the balance evidence; payment-provider receipts without a supported parser are outside this scan.</p>
  <div className="flex flex-wrap gap-2 text-sm"><label>From <input aria-label="Backfill from" type="date" className="rounded-lg border border-line bg-surface p-2" value={start} disabled={busy||!!report?.run&&report.run.status!=='complete'} onChange={e=>setStart(e.target.value)}/></label><label>Through <input aria-label="Backfill through" type="date" className="rounded-lg border border-line bg-surface p-2" value={end} disabled={busy||!!report?.run&&report.run.status!=='complete'} onChange={e=>setEnd(e.target.value)}/></label></div>
  {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
  {report?.run?.last_error&&<p className="text-sm text-danger">{report.run.last_error}</p>}
  <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void scan()}>{busy?'Scanning historical alerts…':report?.run?.status==='scanning'?'Continue historical preview':report?.run?.status==='attention'?'Retry interrupted messages':report?.run?.status==='complete'?'Refresh historical preview':'Preview historical alerts'}</Button>{report?.run&&<Button variant="quiet" disabled={busy} onClick={download}>Download full dry run</Button>}</div>
  {report?.run&&summary&&<>
   <p role="status" className="text-sm">{report.run.start_date} – {report.run.end_date}: {summary.complete?'Preview scan complete — ledger changes await approval.':report.run.status==='attention'?'Scan needs attention; failed emails are not complete.':'Scan incomplete — continue to finish every page and queued message.'}</p>
   <p className="text-xs text-ink-secondary">{summary.discovered} discovered · {summary.processed} processed · {summary.matched} matched · {summary.proposed} proposed imports · {summary.needsReview} need review · {summary.skipped} skipped · {summary.ignored} ignored · {summary.failed} failed · {summary.pending} queued · {summary.imported} imported</p>
   <p className="text-xs text-ink-secondary">{report.subscriptions.length} existing-ledger subscription suggestions. Links and amount changes are proposals only; reminders never create payments.</p>
   <p className="text-xs text-ink-secondary">{report.patterns?.length??0} additional monthly merchant patterns need confirmation.</p>
   {report.items.filter(i=>['proposed','review','failed'].includes(i.status)).slice(0,15).map(i=><div key={i.message_id} className="text-xs"><p className="font-medium">{i.candidate?`${i.candidate.merchant} · ${formatMoney(i.candidate.amount)} · ${i.candidate.date}`:i.message_id}</p><p>{i.status}: {i.reason}</p></div>)}
   <p className="text-xs text-ink-tertiary">Showing up to 15 review cases. Download the full dry run for every message and proposed recurring link. Scan completion means supported-sender discovery finished, not that your accounts are reconciled.</p>
  </>}
 </div>;
}
