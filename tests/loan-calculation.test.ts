import { describe, expect, it } from 'vitest';
import { calculateLoanSchedule } from '../src/modules/loans/loan-calculator';

describe('calculateLoanSchedule', () => {
  it('computes total interest and total payable for a one-year monthly loan', () => {
    const result = calculateLoanSchedule({
      principal_amount: 1200,
      interest_rate: 12,
      start_date: '2026-01-01',
      due_date: '2027-01-01',
      payment_frequency: 'monthly',
    });
    expect(result.totalInterest).toBeCloseTo(144, 0);
    expect(result.totalPayable).toBeCloseTo(1344, 0);
    expect(result.installmentCount).toBeGreaterThan(1);
    expect(result.schedule.length).toBe(result.installmentCount);
  });

  it('produces a single installment for "once" frequency', () => {
    const result = calculateLoanSchedule({
      principal_amount: 500,
      interest_rate: 0,
      start_date: '2026-01-01',
      due_date: '2026-06-01',
      payment_frequency: 'once',
    });
    expect(result.installmentCount).toBe(1);
    expect(result.totalPayable).toBe(500);
    expect(result.schedule[0].amount).toBe(500);
  });

  it('schedule installments sum to totalPayable', () => {
    const result = calculateLoanSchedule({
      principal_amount: 1000,
      interest_rate: 8,
      start_date: '2026-01-01',
      due_date: '2026-10-01',
      payment_frequency: 'weekly',
    });
    const sum = result.schedule.reduce((acc, s) => acc + s.amount, 0);
    expect(Math.round(sum * 100) / 100).toBeCloseTo(result.totalPayable, 1);
  });

  it('rejects a zero-interest, zero-day loan (due_date === start_date)', () => {
    expect(() =>
      calculateLoanSchedule({
        principal_amount: 100,
        interest_rate: 0,
        start_date: '2026-01-01',
        due_date: '2026-01-01',
        payment_frequency: 'once',
      }),
    ).toThrow();
  });
});
