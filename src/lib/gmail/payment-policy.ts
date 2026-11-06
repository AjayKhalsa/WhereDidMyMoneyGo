import type {Account} from '@/lib/domain/types';
import {merchantKey} from '@/lib/engine/merchant-identity';
import {recognizedMerchants} from '@/lib/engine/merchant-recognition';
import {normalizeBankReference} from '@/lib/import/identity';
import type {Alert} from './alerts';
export type PaymentAccount=Pick<Account,'id'|'type'|'isActive'>;
export interface PaymentEvidence {messageId:string;alert:Alert;transactionId?:string;}
export interface TransferPlan {from:string;to:string;peer:PaymentEvidence;basis:'bank-reference'|'cred-payment';}
const payee=(a:Alert)=>{
 const sender=/^NEFT\s+Cr-[A-Z]{4}0[A-Z0-9]{6}-(.+?)-(?:[A-Z]{2}X+[A-Z0-9]*|X+\d{3,})$/i.exec(a.merchant)?.[1];
 return merchantKey(sender??a.merchant).replace(/^neft cr\s*/,'').trim();
};
/** A possible self-name is a reason to abstain, never enough to choose an account. */
export function possibleSelfPayment(a:Alert,names:string[]):boolean {
 const name=payee(a);
 return names.some(n=>{const key=merchantKey(n);return key.length>=3&&(` ${name} `.includes(` ${key} `)||key.length>=8&&name.length>=8&&(key.startsWith(name)||name.startsWith(key)));});
}
export function personalIncome(a:Alert,selfNames:string[]):boolean {
 if(a.direction!=='credit'||a.instrument!=='bank'||a.creditKind!=='unknown'||!['UPI','NEFT','IMPS'].includes(a.paymentRail??'')||possibleSelfPayment(a,selfNames))return false;
 const name=payee(a),words=name.split(' ');
 if(/\b(?:refund|reversal|cashback|loan|principal|maturity|redemption|closure|payout|salary|interest|cred|dreamplug|bank|fund|investment|mandate|self|own|zerodha|groww)\b/i.test(name))return false;
 return !recognizedMerchants(a.merchant).length&&words.length>=2&&words.length<=7&&/^[\p{L} .'-]+$/u.test(name)
  &&! /\b(?:store|shop|services|traders|enterprise|limited|private|technologies|telecom|merchant|payments)\b/i.test(name);
}
export const credDebit=(a:Alert)=>a.direction==='debit'&&a.instrument==='bank'&&/^(?:CRED Club|Dreamplug(?: Technologies)?(?: Private Limited)?)$/i.test(a.merchant.replace(/^UPI(?:\/P2[MPA])?\/\d+\//i,''));
const credReceipt=(a:Alert)=>a.direction==='credit'&&a.instrument==='credit_card'&&a.creditKind==='repayment'&&/^CRED:[A-Z0-9]{6,64}$/.test(a.providerReference??'');
/** Both sides must be freshly authenticated by the caller. A CRED pair needs
 * one bank debit and one successful provider receipt, not just two equal sums. */
export function automaticTransfer(a:Alert,messageId:string,evidence:PaymentEvidence[],accounts:PaymentAccount[]):TransferPlan|undefined {
 if(a.refundStatus||a.creditKind==='refund'||a.creditKind==='income')return;
 const account=(id:string|undefined,type:'BANK'|'CREDIT_CARD')=>accounts.some(x=>x.id===id&&x.type===type&&x.isActive);
 const peers=evidence.filter(e=>e.messageId!==messageId&&e.alert.amount===a.amount&&e.alert.accountId&&e.alert.accountId!==a.accountId);
 let basis:TransferPlan['basis']='bank-reference';
 const ref=normalizeBankReference(a.reference);
 let matches=peers.filter(e=>ref&&normalizeBankReference(e.alert.reference)===ref&&a.instrument==='bank'&&e.alert.instrument==='bank'&&!['refund','income','repayment'].includes(e.alert.creditKind??'')&&!e.alert.refundStatus&&e.alert.direction!==a.direction&&Math.abs(Date.parse(e.alert.date)-Date.parse(a.date))<=3*86400000&&account(a.accountId,'BANK')&&account(e.alert.accountId,'BANK'));
 if(!matches.length&&(credDebit(a)||credReceipt(a))){
  basis='cred-payment';
  matches=peers.filter(e=>e.alert.date===a.date&&(credDebit(a)&&credReceipt(e.alert)||credReceipt(a)&&credDebit(e.alert)));
  // Repeated equal bank debits/card receipts cannot choose one another by order.
  const sameSide=evidence.filter(e=>e.messageId!==messageId&&e.alert.amount===a.amount&&e.alert.date===a.date&&(credDebit(a)?credDebit(e.alert):credReceipt(e.alert)));
  if(sameSide.length)return;
 }
 if(matches.length!==1)return;
 const peer=matches[0]!,debit=a.direction==='debit'?a:peer.alert,credit=a.direction==='credit'?a:peer.alert;
 if(!account(debit.accountId,'BANK')||!account(credit.accountId,basis==='cred-payment'?'CREDIT_CARD':'BANK'))return;
 return {from:debit.accountId!,to:credit.accountId!,peer,basis};
}
