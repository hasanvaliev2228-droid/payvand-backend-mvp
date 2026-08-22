import { describe, expect, it } from 'vitest';
import { calculateLoanSchedule } from '../src/modules/loans/loan-calculator';
import { calculateLoanSchema } from '../src/schemas/loan.schema';

describe('Negative amount / invalid date rejection', () => {
  it('rejects negative principal via the calculator', () => {
    expect(() =>
      calculateLoanSchedule({
        principal_amount: -500,
        interest_rate: 5,
        start_date: '2026-01-01',
        due_date: '2026-06-01',
        payment_frequency: 'monthly',
      }),
    ).toThrow();
  });

  it('rejects negative interest rate via the calculator', () => {
    expect(() =>
      calculateLoanSchedule({
        principal_amount: 500,
        interest_rate: -5,
        start_date: '2026-01-01',
        due_date: '2026-06-01',
        payment_frequency: 'monthly',
      }),
    ).toThrow();
  });

  it('rejects an invalid (non-ISO) date at the schema layer', () => {
    const result = calculateLoanSchema.safeParse({
      principal_amount: 500,
      interest_rate: 5,
      start_date: 'not-a-date',
      due_date: '2026-06-01',
      payment_frequency: 'monthly',
    });
    expect(result.success).toBe(false);
  });

  it('rejects due_date equal to or before start_date at the schema layer', () => {
    const result = calculateLoanSchema.safeParse({
      principal_amount: 500,
      interest_rate: 5,
      start_date: '2026-06-01',
      due_date: '2026-06-01',
      payment_frequency: 'monthly',
    });
    expect(result.success).toBe(false);
  });
});
