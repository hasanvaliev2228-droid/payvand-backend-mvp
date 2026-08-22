/**
 * Pure loan-schedule calculator, shared by the loans module and the
 * calculate-loan Edge Function. No side effects — fully unit testable
 * (see tests/loan-calculation.test.ts).
 */
import { AppError } from '../../lib/errors';

export interface LoanCalculationInput {
  principal_amount: number;
  interest_rate: number; // annual percentage, e.g. 12 = 12%/year
  start_date: string; // ISO date
  due_date: string; // ISO date
  payment_frequency: 'once' | 'weekly' | 'monthly' | 'quarterly';
}

export interface PaymentScheduleEntry {
  due_date: string;
  amount: number;
}

export interface LoanCalculationResult {
  totalInterest: number;
  totalPayable: number;
  installmentCount: number;
  installmentAmount: number;
  schedule: PaymentScheduleEntry[];
}

const FREQUENCY_DAYS: Record<LoanCalculationInput['payment_frequency'], number> = {
  once: Infinity,
  weekly: 7,
  monthly: 30,
  quarterly: 90,
};

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function calculateLoanSchedule(input: LoanCalculationInput): LoanCalculationResult {
  if (input.principal_amount <= 0) {
    throw AppError.validation('Маблағи асосӣ бояд мусбат бошад.');
  }
  if (input.interest_rate < 0) {
    throw AppError.validation('Фоиз наметавонад манфӣ бошад.');
  }
  const totalDays = daysBetween(input.start_date, input.due_date);
  if (totalDays <= 0) {
    throw AppError.validation('Санаи анҷом бояд баъд аз санаи оғоз бошад.');
  }

  const years = totalDays / 365;
  const totalInterest = round2(input.principal_amount * (input.interest_rate / 100) * years);
  const totalPayable = round2(input.principal_amount + totalInterest);

  const stepDays = FREQUENCY_DAYS[input.payment_frequency];
  const installmentCount =
    stepDays === Infinity ? 1 : Math.max(1, Math.ceil(totalDays / stepDays));
  const installmentAmount = round2(totalPayable / installmentCount);

  const schedule: PaymentScheduleEntry[] = [];
  const startMs = new Date(input.start_date).getTime();
  for (let i = 1; i <= installmentCount; i++) {
    const isLast = i === installmentCount;
    const dueMs =
      stepDays === Infinity
        ? new Date(input.due_date).getTime()
        : startMs + Math.min(i * stepDays, totalDays) * 24 * 60 * 60 * 1000;
    const amount = isLast
      ? round2(totalPayable - installmentAmount * (installmentCount - 1))
      : installmentAmount;
    schedule.push({ due_date: new Date(dueMs).toISOString().slice(0, 10), amount });
  }

  return { totalInterest, totalPayable, installmentCount, installmentAmount, schedule };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
