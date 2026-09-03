import { describe, expect, it } from 'vitest';
import {
  calculateFinancialHealth,
  summarizeTransactions,
} from '../src/modules/finance/finance-engine';
import { paymentRequestSchema } from '../src/modules/finance/finance.schema';
import { unavailableProductLookupProvider } from '../src/modules/providers/provider.types';

describe('smart finance engine', () => {
  it('calculates income, expenses and category totals deterministically', () => {
    const result = summarizeTransactions([
      { type: 'income', amount: 1000 },
      { type: 'expense', amount: 250, category_id: 'food' },
      { type: 'transfer', amount: 50 },
    ]);
    expect(result).toMatchObject({
      income: 1000,
      expenses: 250,
      transfers: 50,
      net_cash_flow: 750,
      savings_rate: 0.75,
      expense_by_category: { food: 250 },
    });
  });
  it('does not create a health score without income data', () =>
    expect(
      calculateFinancialHealth(summarizeTransactions([{ type: 'expense', amount: 10 }])),
    ).toBeNull());
  it('validates payment request amount and ISO currency', () => {
    expect(paymentRequestSchema.safeParse({ amount: 10, currency: 'TJS' }).success).toBe(true);
    expect(paymentRequestSchema.safeParse({ amount: -1, currency: 'tjs' }).success).toBe(false);
  });
  it('does not invent barcode product records without a configured provider', async () =>
    expect(await unavailableProductLookupProvider.lookup('1234567890123')).toEqual({
      status: 'not_configured',
    }));
});
