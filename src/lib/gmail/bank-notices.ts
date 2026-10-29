import {plainText,senderAddress} from './alerts';
/** Only used after financial parsing fails and sender authentication succeeds. */
export function nonPaymentNotice(from:string,subject:string,text:string):string|undefined {
 const sender=senderAddress(from),body=plainText(text);
 if(['alerts@axis.bank.in','alerts@axisbank.com'].includes(sender)){
  if(/^We value your feedback$/i.test(subject.trim())&&/survey.*relationship.*interaction/i.test(body))return 'Bank feedback survey; no financial event.';
  if(/^Update on applicable charges for your Axis Bank/i.test(subject)&&/revised charges effective|charges.*will be revised/i.test(body))return 'Future bank fee schedule; not an actual charged fee.';
 }
 if(['alerts@hdfcbank.bank.in','alerts@hdfcbank.net'].includes(sender)&&/^HDFC Bank NACH Debit Mandate Update$/i.test(subject.trim())&&/accepted.*debit mandate/i.test(body)&&/mandate has a value/i.test(body))return 'Mandate acceptance and limit only; no successful debit confirmed.';
}
