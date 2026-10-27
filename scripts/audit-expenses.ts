import {readFileSync} from 'node:fs';
import {domainRow} from '../src/lib/gmail/learning-data';
import {suggestCategory,historicalRules} from '../src/lib/gmail/classification';
import {bankReference,possibleExistingTransactions} from '../src/lib/import/identity';
import type {Transaction,ClassificationRule,Category} from '../src/lib/domain/types';
import type {Alert} from '../src/lib/gmail/alerts';

// Offline dry run only. Input is a private scoped export, never credentials.
const file=process.argv[2];if(!file)throw Error('Pass a private ledger/rules/receipts JSON snapshot.');
const data=JSON.parse(readFileSync(file,'utf8'));
const transactions:Transaction[]=data.transactions.map((t:any)=>domainRow<Transaction>(t));
const categories:Category[]=data.categories.map((c:any)=>domainRow<Category>(c));
const rules:ClassificationRule[]=data.rules.map((r:any)=>domainRow<ClassificationRule>(r));
const receipts:any[]=data.receipts??[];
const reviewed=transactions.filter(t=>!t.enrichment&&(t.source==='manual'||t.source==='parsed'||(t.id.startsWith('txn_')&&t.source==='imported'&&!t.notes?.startsWith('Statement source:'))||receipts.some(r=>r.status==='logged'&&r.transaction_id===t.id&&r.candidate?.categoryId!==t.categoryId)));
const history=historicalRules(reviewed,rules);
const applicable=[...rules.filter(r=>r.learningEvidence?.source!=='history'||!history.conflicts.includes(r.learningEvidence.merchantKey)),...history.rules];
const other=transactions.filter(t=>t.type==='EXPENSE'&&t.categoryId==='other');
const proposals=other.map(t=>{
 const receipt=receipts.find(r=>r.status==='logged'&&r.transaction_id===t.id&&r.candidate?.amount===t.amount&&r.candidate?.date===t.date.slice(0,10));
 const exact=t.timing?.precision==='exact'&&['bank','payment'].includes(t.timing.source);
 // Ledger metadata cannot prove P2P ownership or a VPA. Exclude the general
 // small-UPI heuristic here; it needs confirmed own-name exceptions in sync.
 const alert:Alert={bank:'audit',instrument:'bank',tail:'',...receipt?.candidate,merchant:t.merchant||t.description,amount:t.amount,date:t.date.slice(0,10),direction:'debit',occurredAt:exact?t.date:undefined,timeSource:exact?t.timing!.source as 'bank'|'payment':'unknown',timeConfidence:exact?'exact':'unknown',paymentRail:undefined,vpa:undefined,upiRecipientKind:undefined};
 const prediction=suggestCategory(alert,applicable,categories,[],history.conflicts);
 return {transactionId:t.id,amount:t.amount,date:t.date,description:t.description,currentCategoryId:t.categoryId,suggestedCategoryId:prediction.categoryId,confidence:prediction.confidence,needsReview:prediction.needsReview,reason:prediction.reason,source:prediction.source};
});
const reviews=receipts.filter(r=>r.status==='review').map(r=>{
 const a:Alert|undefined=r.candidate;if(!a?.accountId)return {messageId:r.message_id,status:a?'account-review':'unsupported'};
 const matches=possibleExistingTransactions(transactions,a.accountId,a.amount,a.date,a.direction,a.reference);
 const strong=a.reference?matches.filter(t=>bankReference((t.notes??'')+' '+t.description)===a.reference):[];
 return {messageId:r.message_id,amount:a.amount,date:a.date,possibleTransactionIds:matches.map(t=>t.id),strongTransactionIds:strong.map(t=>t.id),status:strong.length===1?'strong-match-proposal':matches.length?'ambiguous-match':'purpose-review'};
});
const summary={expenses:transactions.filter(t=>t.type==='EXPENSE').length,uncategorized:other.length,uncategorizedAmount:other.reduce((sum,t)=>sum+t.amount,0),supportedCategorySuggestions:proposals.filter(p=>!p.needsReview&&p.suggestedCategoryId!=='other').length,stillUnknown:proposals.filter(p=>p.needsReview||p.suggestedCategoryId==='other').length,reviewEmails:reviews.length,reviewDispositions:Object.fromEntries([...new Set(reviews.map(r=>r.status))].map(s=>[s,reviews.filter(r=>r.status===s).length])),writes:0};
console.log(JSON.stringify(process.argv.includes('--details')?{summary,proposals,reviews}:{summary},null,2));
