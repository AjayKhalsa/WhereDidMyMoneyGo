"use client";
import {useFinance} from '@/lib/hooks/use-finance';
import {useMoneyText} from '@/lib/hooks/use-privacy';
import {useAddSheet} from '@/components/add/add-sheet-provider';
import {projectMoneyLinks} from '@/lib/engine/money-links';
export function LinkedMoneyPanel(){
 const {db,now}=useFinance();const money=useMoneyText();const {openLinks}=useAddSheet();
 if(!db||!db.moneyLinks?.length)return null;
 const p=projectMoneyLinks(db,now);const ids=[...new Set(db.moneyLinks.map(l=>l.incomeId))];
 return <details className="visual-card"><summary className="flex min-h-11 cursor-pointer flex-wrap justify-between gap-2 font-medium"><span>Linked money</span><span>{money(p.held)} held aside</span></summary><p className="mt-3 text-sm text-ink-secondary">{money(p.passThroughHeld)} held for others · {money(p.purchaseFundsHeld)} reserved purchase funding. These amounts are excluded from safe-to-spend.</p><div className="mt-3 space-y-2">{ids.map(id=>{const t=db.transactions.find(t=>t.id===id);if(!t)return null;return <button key={id} type="button" onClick={()=>openLinks(id)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-line px-3 text-left text-sm"><span className="min-w-0 truncate">{t.description}<span className="mt-1 block text-xs text-ink-tertiary">{t.date.slice(0,10)} · Review linked purchases and forwarding</span></span><span className="shrink-0">{money(p.excluded.get(id)??0)} ↗</span></button>;})}</div></details>;
}
