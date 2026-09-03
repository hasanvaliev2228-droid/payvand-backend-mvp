/** Deterministic finance calculations; no provider data or investment advice is fabricated. */
export interface FinanceTransaction {
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category_id?: string | null;
}
export interface FinanceSummary {
  income: number;
  expenses: number;
  transfers: number;
  net_cash_flow: number;
  savings_rate: number | null;
  expense_by_category: Record<string, number>;
}

export function summarizeTransactions(rows: readonly FinanceTransaction[]): FinanceSummary {
  let income = 0;
  let expenses = 0;
  let transfers = 0;
  const expense_by_category: Record<string, number> = {};
  for (const row of rows) {
    if (!Number.isFinite(row.amount) || row.amount <= 0) continue;
    if (row.type === 'income') income += row.amount;
    if (row.type === 'expense') {
      expenses += row.amount;
      const key = row.category_id ?? 'uncategorized';
      expense_by_category[key] = (expense_by_category[key] ?? 0) + row.amount;
    }
    if (row.type === 'transfer') transfers += row.amount;
  }
  return {
    income,
    expenses,
    transfers,
    net_cash_flow: income - expenses,
    savings_rate: income ? (income - expenses) / income : null,
    expense_by_category,
  };
}

/** Transparent, conservative health score. Null means insufficient data, never an invented score. */
export function calculateFinancialHealth(summary: FinanceSummary): number | null {
  if (summary.income <= 0) return null;
  const rate = summary.savings_rate ?? 0;
  return Math.max(0, Math.min(100, Math.round(50 + rate * 100)));
}
