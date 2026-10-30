import type {FoodReceipt} from './food-receipts';
export interface ReceiptReviewItem {messageId:string;status:string;receipt?:FoodReceipt;receivedDay?:string;possiblePayments?:{id:string;date:string;description:string;accountId?:string}[];link?:{status:string;transactionId:string|null}|null}
/** Selection convenience only. These remain unproven matches requiring the
 * user's explicit batch confirmation and fresh server validation per receipt. */
export function reviewableReceiptMatches(items:ReceiptReviewItem[]):ReceiptReviewItem[]{
 const candidates=items.filter(i=>i.status==='evidence'&&i.receipt&&!i.link&&i.possiblePayments?.length===1);
 const ordersByPayment=new Map<string,Set<string>>();
 const paymentsByOrder=new Map<string,Set<string>>();
 const order=(i:ReceiptReviewItem)=>`${i.receipt!.provider}:${i.receipt!.orderId}`;
 for(const i of candidates){const id=i.possiblePayments![0]!.id,key=order(i);const orders=ordersByPayment.get(id)??new Set<string>();orders.add(key);ordersByPayment.set(id,orders);const payments=paymentsByOrder.get(key)??new Set<string>();payments.add(id);paymentsByOrder.set(key,payments);}
 const seen=new Set<string>();
 return candidates.filter(i=>{const key=order(i);if(seen.has(key)||paymentsByOrder.get(key)!.size!==1||ordersByPayment.get(i.possiblePayments![0]!.id)!.size!==1)return false;seen.add(key);return true;});
}
