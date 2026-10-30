import {header,plainText,senderAddress,type MailPart} from './alerts';
import type {Transaction} from '@/lib/domain/types';
export interface FoodReceipt {provider:'Zomato'|'Swiggy';orderId:string;paidAmount:number;restaurant?:string;outletAddress?:string}
/** Preserve structural boundaries for outlet extraction. Financial alerts keep
 * using mailText; receipt HTML/text alternatives must never be concatenated. */
export function receiptMailText(part:MailPart):string {
 if(part.filename)return '';
 if(part.body?.data&&/^text\/(plain|html)$/.test(part.mimeType??''))return Buffer.from(part.body.data,'base64url').toString('utf8');
 const children=part.parts??[];
 if(part.mimeType==='multipart/alternative')return receiptMailText(children.find(p=>p.mimeType==='text/html')??children.find(p=>p.mimeType==='text/plain')??children[0]??{});
 return children.map(receiptMailText).filter(Boolean).join('\n');
}
export function authenticatedFoodReceipt(part:MailPart):boolean {
 const sender=senderAddress(header(part,'From'));
 if(!['noreply@zomato.com','noreply@swiggy.in'].includes(sender))return false;
 const auth=header(part,'Authentication-Results');
 const aligned=/dmarc=pass\b[^;]*\bheader\.from=([\w.-]+)/i.exec(auth)?.[1]?.toLowerCase();
 return /^mx\.google\.com;/i.test(auth.trim())&&aligned===sender.split('@')[1];
}
/** Explicit completed-order templates only. Never extract delivery addresses or infer payment time. */
export function parseFoodReceipt(from:string,subject:string,text:string):FoodReceipt|null {
 const sender=senderAddress(from),body=plainText(text);
 const provider=sender==='noreply@zomato.com'?'Zomato':sender==='noreply@swiggy.in'?'Swiggy':undefined;
 if(!provider||/cancel|refund|failed|pending/i.test(subject))return null;
 const orderId=/\bORDER (?:ID|NUMBER|NO\.?)\s*[:#]?\s*(\d{8,25})\b/i.exec(body)?.[1];
 const paid=provider==='Zomato'?/\bTotal paid\s*[-:]?\s*(?:₹|INR|Rs\.?)\s*([\d,]+\.\d{2}|[\d,]+)\b/i.exec(body):/\bPaid Via\s+(?:Bank|Card|UPI)\s*(?:₹|INR|Rs\.?)\s*([\d,]+\.\d{2}|[\d,]+)\b/i.exec(body);
 if(!orderId||!paid||! /\bdelivered\b/i.test(`${subject} ${body}`))return null;
 const paidAmount=Math.round(Number(paid[1]!.replace(/,/g,''))*100);
 if(!Number.isSafeInteger(paidAmount)||paidAmount<=0)return null;
 const receipt:FoodReceipt={provider,orderId,paidAmount};
 if(provider==='Swiggy'){
  const lines=text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<\/(?:p|div|td|tr|h[1-6])\s*>|<br\s*\/?\s*>/gi,'\n').split(/\r?\n/).map(plainText).filter(Boolean);
  const at=lines.findIndex(line=>/^ORDER JOURNEY$/i.test(line));
  const name=lines[at+1],address=lines[at+2],date=lines[at+3];
  // The first journey clock closes the restaurant section before the customer
  // name/home address. Without this exact layout, leave outlet fields unknown.
  if(at>=0&&name&&address&&date&&/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{1,2}:\d{2}\s*[AP]M\b/i.test(date)&&name.length<=120&&!/address|deliver|customer|recipient|@/i.test(name)){
   receipt.restaurant=name;
   if(address.length>=8&&address.length<=400&&/\b(?:road|rd|street|shop|floor|plot|lane|building|nagar|marg)\b/i.test(address)&&!/deliver(?:y| to)|customer|recipient|@/i.test(address)&&address.replace(/[.\s]/g,'').toLowerCase()!==name.replace(/[.\s]/g,'').toLowerCase())receipt.outletAddress=address;
  }
 }
 if(provider==='Zomato'){
  const restaurant=/^Your Zomato order from\s+(.{1,120})$/i.exec(subject)?.[1]?.trim();
  if(restaurant){
   receipt.restaurant=restaurant;
   const anchor=`Delivered ${restaurant} `,start=body.indexOf(anchor);
   if(start>=0){
    const tail=body.slice(start+anchor.length);
    const end=/\s+\d+\s*[X×]\s+/i.exec(tail)?.index;
    // Only the explicitly delimited restaurant section, never the rest of the email.
    const address=end===undefined?'':tail.slice(0,end).trim();
    if(address.length>=8&&address.length<=400&&!/deliver(?:y| to)|customer|recipient|total paid/i.test(address))receipt.outletAddress=address;
   }
  }
 }
 return receipt;
}
/** Suggestions only: amount/day/platform cannot prove a canonical financial identity. */
export function possibleFoodPayments(receipt:FoodReceipt,receivedDay:string,transactions:Transaction[]):Transaction[]{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(receivedDay))return [];
 const received=Date.parse(receivedDay+'T12:00:00Z');
 return transactions.filter(t=>t.type==='EXPENSE'&&t.amount===receipt.paidAmount&&Math.abs(Date.parse(t.date.slice(0,10)+'T12:00:00Z')-received)<=86400000&&new RegExp(`\\b${receipt.provider}\\b`,'i').test(`${t.merchant??''} ${t.description}`));
}

/** An explicit provider + labelled order ID is stronger than amount/day.
 * It still must identify one eligible payment; bare bank references do not count. */
export function exactFoodOrder(t:Transaction,receipt:FoodReceipt):boolean {
 if(!/^\d{8,25}$/.test(receipt.orderId))return false;
 const text=`${t.merchant??''} ${t.description} ${t.notes??''}`;
 return new RegExp(`\\b${receipt.provider}\\b`,'i').test(text)&&new RegExp(`\\border(?:\\s*(?:id|no\\.?|number))?\\s*[:#-]?\\s*${receipt.orderId}\\b`,'i').test(text);
}
