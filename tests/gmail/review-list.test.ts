import test from "node:test";
import assert from "node:assert/strict";
import { actionableGmailReviews, suggestedExistingEntry, groupGmailReviews } from "@/lib/gmail/review-list";
import { expense } from "../helpers/factories";
import type { Alert } from "@/lib/gmail/alerts";

const categories = new Set(["other", "health", "transport.auto"]);
const bank = { bank: "HDFC", instrument: "bank", tail: "1234", amount: 60000, date: "2026-10-27", merchant: "Example Person", direction: "debit", accountId: "bank", reference: "111122223333" } as Alert;

test("already-corrected specific categories disappear without changing ledger or receipts", () => {
  const t = expense({ id: "saved", categoryId: "health" });
  const receipt = { message_id: "email", status: "logged", category_review: true, transaction_id: t.id, category_review_snapshot: { category_id: "other" } };
  const before = structuredClone({ t, receipt });
  assert.deepEqual(actionableGmailReviews([receipt], [t], [], categories), []);
  assert.deepEqual({ t, receipt }, before);
});

test("missing, invalid, unchanged and still-uncategorized labels remain actionable", () => {
  const receipt = { message_id: "email", status: "logged", category_review: true, transaction_id: "saved", category_review_snapshot: { category_id: "other" } };
  for (const transactions of [[], [expense({ id: "saved", categoryId: "other" })], [expense({ id: "saved", categoryId: "deleted-category" })]]) {
    assert.equal(actionableGmailReviews([receipt], transactions, [], categories).length, 1);
  }
  const t = expense({ id: "saved", categoryId: "health", notes: "Notes changed, category not confirmed" });
  assert.equal(actionableGmailReviews([{ ...receipt, category_review_snapshot: { category_id: "health" } }], [t], [], categories).length, 1);
  assert.equal(actionableGmailReviews([{ ...receipt, category_review_snapshot: null }], [t], [], categories).length, 1);
  assert.equal(actionableGmailReviews([{ ...receipt, category_review_snapshot: {} }], [t], [], categories).length, 1);
});

test("canonical strong matches are hidden; weak or unauthenticated matches remain for a decision", () => {
  const t = expense({ id: "saved", accountId: "bank", amount: bank.amount, date: bank.date + "T00:00:00", notes: "Bank reference " + bank.reference });
  const receipt = { message_id: "email", status: "review", candidate: bank, reason: "Check financial purpose" };
  assert.equal(actionableGmailReviews([receipt], [t], [], categories).length, 0);
  assert.equal(actionableGmailReviews([{ ...receipt, candidate: { ...bank, reference: undefined } }], [t], [], categories).length, 1);
  assert.equal(actionableGmailReviews([{ ...receipt, reason: "Sender authentication could not be verified." }], [t], [], categories).length, 1);
  assert.equal(actionableGmailReviews([receipt], [t, { ...t, id: "ambiguous" }], [], categories).length, 1);
  assert.equal(actionableGmailReviews([{ ...receipt, status: "ignored" }], [t], [], categories).length, 0);
});

test("a unique exact-day normalized payee is suggested but equal repeated payments are not guessed", () => {
  const t=expense({id:"likely",accountId:"bank",amount:bank.amount,date:bank.date+"T00:00:00",merchant:"EXAMPLE PERSON",notes:undefined});
  const weak={...bank,reference:undefined};
  assert.equal(suggestedExistingEntry(weak,[t]),"likely");
  assert.equal(actionableGmailReviews([{message_id:"email",status:"review",candidate:weak}],[t],[],categories).length,1,"A suggestion is not an automatic match");
  assert.equal(suggestedExistingEntry(weak,[t,{...t,id:"second-payment"}]),undefined);
  assert.equal(suggestedExistingEntry(weak,[{...t,accountId:"different-bank"}]),undefined);
  assert.equal(suggestedExistingEntry(weak,[{...t,merchant:"Different person"}]),undefined);
  assert.equal(suggestedExistingEntry(weak,[{...t,date:"2026-10-28T00:00:00"}]),undefined);
});

test('saved entries and weak existing matches are separate from missing-payment alerts',()=>{
 const t=expense({id:'saved',accountId:'bank',merchant:'Example Person',amount:bank.amount,date:bank.date+'T00:00:00',categoryId:'other'});
 const category={message_id:'category',status:'logged',category_review:true,transaction_id:'saved'};
 const possible={message_id:'possible',status:'review',candidate:{...bank,reference:undefined}};
 const missing={message_id:'new',status:'review',candidate:{...bank,amount:100}};
 const rows=[category,possible,missing],before=JSON.stringify({rows,t});
 const grouped=groupGmailReviews(rows,[t]);
 assert.deepEqual(grouped.category,[category]);assert.deepEqual(grouped.possibleExisting,[possible]);assert.deepEqual(grouped.financial,[missing]);
 assert.equal(JSON.stringify({rows,t}),before);
 assert.equal(groupGmailReviews([category],[]).category.length,0);
 assert.equal(groupGmailReviews([possible],[t,{...t,id:'second'}]).financial.length,1);
 assert.equal(groupGmailReviews([{...possible,reason:'Sender authentication not verified'}],[t]).financial.length,1);
});

test('two emails competing for one saved payment cannot both get a confident suggestion',()=>{
 const t=expense({id:'saved',accountId:'bank',merchant:'Example Person',amount:bank.amount,date:bank.date+'T00:00:00'});
 const first={message_id:'one',status:'review',candidate:{...bank,reference:undefined}};
 const result=groupGmailReviews([first,{...first,message_id:'two'}],[t]);
 assert.equal(result.possibleExisting.length,0);assert.equal(result.financial.length,2);
 assert.ok(result.financial.every(r=>r.suppress_suggested_match));
});
