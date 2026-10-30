import assert from 'node:assert/strict';
import test from 'node:test';
import {reviewableReceiptMatches,type ReceiptReviewItem} from '@/lib/gmail/receipt-review';
const item=(messageId:string,orderId:string,target:string):ReceiptReviewItem=>({messageId,status:'evidence',receipt:{provider:'Swiggy',orderId,paidAmount:50000},possiblePayments:[{id:target,date:'2026-10-29',description:'Swiggy'}]});
test('batch suggestions omit ambiguous, resolved, dismissed and conflicting order/payment claims',()=>{
 const first=item('one','1234567890','payment1'),second=item('two','2234567890','payment2');
 const rows=[first,second,item('same-order','1234567890','payment1'),{...item('many','3234567890','a'),possiblePayments:[{id:'a',date:'2026-10-29',description:'Swiggy'},{id:'b',date:'2026-10-29',description:'Swiggy'}]}, {...item('dismissed','4234567890','payment4'),status:'dismissed'},{...item('linked','5234567890','payment5'),link:{status:'linked',transactionId:'payment5'}},item('collision1','6234567890','collision'),item('collision2','7234567890','collision')];
 const before=JSON.stringify(rows);assert.deepEqual(reviewableReceiptMatches(rows).map(i=>i.messageId),['one','two']);assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(reviewableReceiptMatches([first,item('same-order-different-payment','1234567890','different')]),[]);
});
