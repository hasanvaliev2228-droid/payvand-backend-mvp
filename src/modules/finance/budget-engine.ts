export interface Budget {
  id: string;
  category_id: string | null;
  amount: number;
}
export interface BudgetProgress {
  budget_id: string;
  spent: number;
  remaining: number;
  percent_used: number;
}
/** Computes budget progress from confirmed transaction rows only. */
export function calculateBudgetProgress(
  budgets: readonly Budget[],
  expenses: Readonly<Record<string, number>>,
): BudgetProgress[] {
  return budgets.map((budget) => {
    const spent = budget.category_id
      ? (expenses[budget.category_id] ?? 0)
      : Object.values(expenses).reduce((sum, value) => sum + value, 0);
    return {
      budget_id: budget.id,
      spent,
      remaining: budget.amount - spent,
      percent_used: budget.amount ? spent / budget.amount : 0,
    };
  });
}
