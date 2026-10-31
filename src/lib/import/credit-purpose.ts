import type {ImportDraft} from './build-drafts';

export type CreditPurpose='income'|'refund'|'transfer';

/** A bank credit establishes direction, not ownership or financial purpose. */
export function creditPurposeHint(narration:string):CreditPurpose|undefined {
  if(/\b(?:refund(?:ed)?|reversal|cashback)\b/i.test(narration))return 'refund';
  // A payout can contain principal as well as interest; loan proceeds, a
  // returned payment or an own-account narration are not proved earnings.
  if(/\b(?:principal|maturity|redemption|closure|closed|payout|loan|repayment|self|return(?:ed)?)\b|\b(?:own|salary)\s+account\b/i.test(narration)||/^UPI[-/\s]/i.test(narration))return;
  if(/\bsalary\b|\bsal\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(narration))return 'income';
  if(/\bint\.?\s*pd\b|\binterest\s+(?:paid|credit(?:ed)?)\b/i.test(narration))return 'income';
}

export function reviewCreditPurpose<T extends ImportDraft>(row:T,purpose:CreditPurpose):T {
  if(row.direction!=='credit')throw new Error('Only a bank credit can be reviewed as money received.');
  return {...row,type:purpose==='transfer'?'TRANSFER':'INCOME',needsCreditReview:false,
    isRefund:purpose==='refund'?true:undefined,
    categoryId:purpose==='refund'?(row.isRefund?row.categoryId:row.refundCategoryId)??'other':undefined,
    toAccountId:undefined,fromAccountId:undefined};
}

/** Choosing a spending category must never turn received money into a debit. */
export function reviewImportCategory<T extends ImportDraft>(row:T,categoryId:string):T {
  if(row.direction==='credit') {
    if(row.type!=='INCOME'||!row.isRefund)throw new Error('Choose Refund before assigning a spending category to received money.');
    return {...row,categoryId};
  }
  return {...row,categoryId,type:'EXPENSE',toAccountId:undefined,fromAccountId:undefined,isRefund:undefined};
}
