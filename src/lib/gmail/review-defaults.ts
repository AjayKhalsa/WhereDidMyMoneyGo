import type { Alert } from "./alerts";

/** Repayment confirmations are transfers; neither the whole bill nor income. */
export function reviewDefaults(alert?: Alert) {
  if (alert?.creditKind === "repayment") return { kind: "TRANSFER", accountId: "", toAccountId: alert.accountId ?? "" };
  if (alert?.direction === 'credit' && alert.creditKind === 'refund') return {kind:'REFUND',accountId:alert.accountId??'',toAccountId:''};
  if (alert?.direction === 'credit' && alert.incomeKind === 'salary') return {kind:'INCOME',accountId:alert.accountId??'',toAccountId:''};
  const likelyCardPayment = alert?.direction === "debit" && alert.special && /\bcred\b|dreamplug|billpay|card payment/i.test(alert.merchant);
  return { kind: likelyCardPayment ? "TRANSFER" : alert?.direction === "credit" ? "" : "EXPENSE", accountId: alert?.accountId ?? "", toAccountId: "" };
}
