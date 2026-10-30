import type { Database } from '@/lib/domain/types';
import { balanceVerification } from './reconciliation';
import { actualTransactionTime } from '@/lib/domain/transaction-time';
export function dataQuality(db: Database, today: string) {
    const expenses = db.transactions.filter(t => t.type === 'EXPENSE' && t.categoryId !== 'adjustment' && t.date.slice(0, 10) <= today);
    const ids = new Set(db.categories.map(c => c.id));
    const uncategorized = expenses.filter(t => !t.categoryId || t.categoryId === 'other' || !ids.has(t.categoryId));
    const verifiedTimes = expenses.filter(t => !!actualTransactionTime(t)).length;
    const accounts = db.accounts.filter(a => a.isActive && a.type !== 'INVESTMENT').map(a => {
        const check = balanceVerification(a, db.transactions);
        return { id: a.id, name: a.name, status: check.status, asOf: check.checkpoint?.asOf, source: check.checkpoint?.source };
    });
    return { expenses: expenses.length, uncategorized: uncategorized.length, uncategorizedAmount: uncategorized.reduce((n, t) => n + t.amount, 0), verifiedTimes, unknownOrEstimatedTimes: expenses.length - verifiedTimes, accounts };
}
