import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { accountBalance, creditCardOutstanding, liquidBalance, valueInvestments } from '../../src/lib/engine/analytics';
import type { Account, Transaction, Investment } from '../../src/lib/domain/types';

// Execute the real Home component with its disclosure open. JSX nodes stay
// inspectable; financial calculations use the actual accounting functions.
function renderCashStrip(accounts: Account[], transactions: Transaction[]) {
  const jsx = (type: unknown, props: unknown) => ({type, props});
  const imports: Record<string, unknown> = {
    'react': {useState: () => [true, () => {}]},
    'react/jsx-runtime': {jsx, jsxs: jsx},
    'lucide-react': {ChevronDown: 'ChevronDown'},
    '@/lib/engine/analytics': {accountBalance, creditCardOutstanding},
    '@/lib/hooks/use-finance': {useFinance: () => ({db: {accounts, transactions}, safeToSpend: {bankBalance: liquidBalance(accounts, transactions)}})},
    '@/components/ui/amount': {Amount: 'Amount'},
    '@/lib/utils': {cn: () => '', pluralise: (n: number, s: string) => n === 1 ? s : s + 's'},
  };
  const compiled = ts.transpileModule(fs.readFileSync('src/components/home/liquid-cash-strip.tsx', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText;
  const exports: Record<string, any> = {};
  vm.runInNewContext(compiled, {exports, require: (name: string) => {assert(name in imports, name); return imports[name];}});
  return JSON.stringify(exports.LiquidCashStrip());
}
const bank = {id:'bank', name:'Bank', type:'BANK', isActive:true, openingBalance:3000000} as Account;
const fund = {id:'fund', name:'Fund transfer origin', type:'INVESTMENT', isActive:true, openingBalance:0} as Account;
const broker = {id:'broker', name:'Broker transfer origin', type:'INVESTMENT', isActive:true, openingBalance:0} as Account;
const card = {id:'card', name:'Card', type:'CREDIT_CARD', isActive:true, openingBalance:0} as Account;
const rows = [
  {id:'buy', type:'INVESTMENT', amount:3000000, accountId:'bank', investmentId:'holding', date:'2026-09-26'},
  {id:'sell', type:'TRANSFER', amount:1972657, accountId:'fund', toAccountId:'bank', investmentId:'holding', date:'2026-10-08'},
  {id:'stock-sale', type:'TRANSFER', amount:85888, accountId:'broker', toAccountId:'bank', date:'2026-10-09'},
] as Transaction[];
test('Home cash breakdown excludes investment transfer origins with negative flow totals', () => {
  assert.equal(accountBalance(fund, rows), -1972657); // Flow total, not fund NAV.
  const rendered = renderCashStrip([bank, fund, broker, card], rows);
  assert(!rendered.includes('Fund transfer origin'), 'Investment outflow must not appear as a negative cash account');
  assert(!rendered.includes('Broker transfer origin'), 'Sold-stock transfer origin must not appear as negative cash');
  assert(rendered.includes('Bank')); assert(rendered.includes('Card'));
  assert(rendered.includes(String(liquidBalance([bank, fund, broker, card], rows))));
});
test('30k contribution less redemption is positive net invested; stock sale does not alter the mutual fund', () => {
  const holding = {id:'holding', name:'Fund', isActive:true} as Investment;
  const valuation = valueInvestments([holding], rows, new Date('2026-10-19'))[0]!;
  assert.equal(valuation.contributed, 3000000);
  assert.equal(valuation.value, 1027343);
  assert.equal(liquidBalance([bank, fund, broker], rows), 1972657 + 85888);
});
