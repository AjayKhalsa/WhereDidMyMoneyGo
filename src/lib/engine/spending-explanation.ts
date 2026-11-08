import type { spendingDrivers } from './spending-drivers';

/** Arithmetic attribution, not a causal claim. Both periods are already aligned
 * by spendingDrivers. Symmetric decomposition splits the count/ticket interaction
 * equally, so there is no arbitrary choice of which period supplies the weights. */
export function explainSpending(report: ReturnType<typeof spendingDrivers>) {
  const { compared: current, previous } = report;
  const currentAverage = current.count ? current.gross / current.count : null;
  const previousAverage = previous.count ? previous.gross / previous.count : null;
  const canSeparate = report.hasComparison && currentAverage !== null && previousAverage !== null;
  const grossChange = current.gross - previous.gross;
  const frequency = canSeparate
    ? Math.round((current.count - previous.count) * (currentAverage + previousAverage) / 2)
    : null;
  const ticket = frequency === null ? null : grossChange - frequency;
  const refundEffect = previous.refunds - current.refunds;
  const effects = !report.hasComparison ? [] : frequency !== null && ticket !== null
    ? [
      { id: 'frequency', label: 'Purchase frequency', amount: frequency },
      { id: 'ticket', label: 'Average purchase size', amount: ticket },
      { id: 'refunds', label: 'Refunds received', amount: refundEffect },
    ]
    : [
      { id: 'purchases', label: 'Purchases', amount: grossChange },
      { id: 'refunds', label: 'Refunds received', amount: refundEffect },
    ];
  const dominant = [...effects].filter(e => e.amount !== 0 && Math.sign(e.amount) === Math.sign(report.difference)).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
  const purchases = report.currentRows.filter(t => t.type === 'EXPENSE').sort((a, b) => b.amount - a.amount);
  const largest = purchases.slice(0, 3);
  const largestAmount = largest.reduce((sum, t) => sum + t.amount, 0);
  return {
    currentCount: current.count, previousCount: previous.count,
    currentAverage: currentAverage === null ? null : Math.round(currentAverage),
    previousAverage: previousAverage === null ? null : Math.round(previousAverage),
    effects, dominant, canSeparate,
    largest, largestAmount,
    largestShare: report.current.gross > 0 ? largestAmount / report.current.gross * 100 : null,
    purchaseCount: purchases.length,
  };
}
