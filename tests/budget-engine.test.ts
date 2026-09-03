import { describe, expect, it } from 'vitest';
import { calculateBudgetProgress } from '../src/modules/finance/budget-engine';
describe('budget engine', () => {
  it('uses category expenses for a category budget and all expenses for an overall budget', () => {
    expect(
      calculateBudgetProgress(
        [
          { id: 'food', category_id: 'food', amount: 100 },
          { id: 'all', category_id: null, amount: 500 },
        ],
        { food: 80, travel: 20 },
      ),
    ).toEqual([
      { budget_id: 'food', spent: 80, remaining: 20, percent_used: 0.8 },
      { budget_id: 'all', spent: 100, remaining: 400, percent_used: 0.2 },
    ]);
  });
});
