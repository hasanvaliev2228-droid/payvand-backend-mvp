import { describe, expect, it } from 'vitest';
import { createTransactionSchema } from '../src/schemas/transaction.schema';
import { createCardSchema } from '../src/schemas/card.schema';
import { createLoanSchema } from '../src/schemas/loan.schema';
import { sendMessageSchema } from '../src/schemas/message.schema';
import { createHealthRecordSchema } from '../src/schemas/health.schema';

describe('Zod validation', () => {
  it('accepts a valid transaction', () => {
    const result = createTransactionSchema.safeParse({
      type: 'expense',
      amount: 150.5,
      title: 'Хӯрок',
      currency: 'TJS',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a negative transaction amount', () => {
    const result = createTransactionSchema.safeParse({
      type: 'expense',
      amount: -10,
      title: 'Хӯрок',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a zero transaction amount', () => {
    const result = createTransactionSchema.safeParse({
      type: 'expense',
      amount: 0,
      title: 'Хӯрок',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a card with only last4', () => {
    const result = createCardSchema.safeParse({
      title: 'Корти асосӣ',
      bank_name: 'Amonatbank',
      last4: '4242',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a card with a full PAN in the last4 field', () => {
    const result = createCardSchema.safeParse({
      title: 'Корти асосӣ',
      bank_name: 'Amonatbank',
      last4: '4242424242424242',
    });
    expect(result.success).toBe(false);
  });

  it('has no field for CVV or expiry on the card schema', () => {
    const shape = createCardSchema.shape;
    expect(Object.keys(shape)).not.toContain('cvv');
    expect(Object.keys(shape)).not.toContain('expiry');
    expect(Object.keys(shape)).not.toContain('pin');
  });

  it('rejects a loan with due_date before start_date', () => {
    const result = createLoanSchema.safeParse({
      borrower_name: 'Ахмад',
      loan_type: 'given',
      principal_amount: 1000,
      interest_rate: 5,
      start_date: '2026-06-01',
      due_date: '2026-01-01',
      payment_frequency: 'monthly',
    });
    expect(result.success).toBe(false);
  });

  it('requires either body or file_path on a message', () => {
    const result = sendMessageSchema.safeParse({
      conversation_id: '00000000-0000-0000-0000-000000000000',
      message_type: 'text',
    });
    expect(result.success).toBe(false);
  });

  it('requires systolic/diastolic for blood_pressure health records', () => {
    const result = createHealthRecordSchema.safeParse({
      record_type: 'blood_pressure',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a complete blood_pressure health record', () => {
    const result = createHealthRecordSchema.safeParse({
      record_type: 'blood_pressure',
      systolic: 120,
      diastolic: 80,
    });
    expect(result.success).toBe(true);
  });
});
