/**
 * Loans module (given / taken) + payment schedule.
 * Security note: RLS scopes loans to owner_id, and loan_payments are scoped
 * transitively through their parent loan's ownership.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import {
  deleteRowById,
  getRowById,
  insertRow,
  listRows,
  updateRowById,
} from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import {
  createLoanPaymentSchema,
  createLoanSchema,
  updateLoanSchema,
  type CreateLoanInput,
  type CreateLoanPaymentInput,
  type UpdateLoanInput,
} from '../../schemas/loan.schema';
import type { ListResult } from '../../types/api.types';
import { calculateLoanSchedule } from './loan-calculator';

type LoanRow = Database['public']['Tables']['loans']['Row'];
type LoanPaymentRow = Database['public']['Tables']['loan_payments']['Row'];

export async function listMyLoans(
  client: SupabaseClient<Database>,
  userId: string,
  options: Omit<ListOptions, 'filters'> & { status?: string; loan_type?: string },
): Promise<ListResult<LoanRow>> {
  const { status, loan_type, ...rest } = options;
  return listRows<LoanRow>(client, 'loans', {
    ...rest,
    filters: { owner_id: userId, status, loan_type },
  });
}

export async function getMyLoan(client: SupabaseClient<Database>, id: string): Promise<LoanRow> {
  return getRowById<LoanRow>(client, 'loans', id);
}

export async function createLoan(
  client: SupabaseClient<Database>,
  userId: string,
  input: CreateLoanInput,
): Promise<LoanRow> {
  const values = parseOrThrow(createLoanSchema, input);
  const schedule = calculateLoanSchedule(values);
  return insertRow<LoanRow>(client, 'loans', {
    ...values,
    owner_id: userId,
    total_payable: schedule.totalPayable,
    status: 'active',
  });
}

export async function updateLoan(
  client: SupabaseClient<Database>,
  id: string,
  input: UpdateLoanInput,
): Promise<LoanRow> {
  const values = parseOrThrow(updateLoanSchema, input);
  return updateRowById<LoanRow>(client, 'loans', id, values);
}

export async function deleteLoan(client: SupabaseClient<Database>, id: string): Promise<void> {
  return deleteRowById(client, 'loans', id);
}

export async function addLoanPayment(
  client: SupabaseClient<Database>,
  input: CreateLoanPaymentInput,
): Promise<LoanPaymentRow> {
  const values = parseOrThrow(createLoanPaymentSchema, input);
  return insertRow<LoanPaymentRow>(client, 'loan_payments', values);
}

export async function listLoanPayments(
  client: SupabaseClient<Database>,
  loanId: string,
  options: Omit<ListOptions, 'filters'>,
): Promise<ListResult<LoanPaymentRow>> {
  return listRows<LoanPaymentRow>(client, 'loan_payments', {
    ...options,
    filters: { loan_id: loanId },
  });
}
