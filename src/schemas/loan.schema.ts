import { z } from 'zod';

export const paymentFrequencySchema = z.enum(['once', 'weekly', 'monthly', 'quarterly']);
export const loanTypeSchema = z.enum(['given', 'taken']);
export const loanStatusSchema = z.enum(['draft', 'active', 'overdue', 'paid', 'cancelled']);

export const createLoanSchema = z
  .object({
    borrower_name: z.string().trim().min(1).max(120),
    borrower_phone: z.string().trim().max(30).optional(),
    loan_type: loanTypeSchema,
    principal_amount: z.number().positive().max(1_000_000_000),
    interest_rate: z.number().min(0).max(100).default(0),
    start_date: z.string().date(),
    due_date: z.string().date(),
    payment_frequency: paymentFrequencySchema,
    description: z.string().trim().max(500).optional(),
  })
  .refine((v) => new Date(v.due_date) >= new Date(v.start_date), {
    message: 'Санаи анҷом бояд баъд аз санаи оғоз бошад.',
    path: ['due_date'],
  });
export type CreateLoanInput = z.infer<typeof createLoanSchema>;

export const updateLoanSchema = z.object({
  borrower_name: z.string().trim().min(1).max(120).optional(),
  borrower_phone: z.string().trim().max(30).optional(),
  status: loanStatusSchema.optional(),
  description: z.string().trim().max(500).optional(),
});
export type UpdateLoanInput = z.infer<typeof updateLoanSchema>;

export const calculateLoanSchema = z
  .object({
    principal_amount: z.number().positive('Маблағи асосӣ бояд мусбат бошад.'),
    interest_rate: z.number().min(0, 'Фоиз наметавонад манфӣ бошад.').max(1000),
    start_date: z.string().date('Санаи оғоз нодуруст аст.'),
    due_date: z.string().date('Санаи анҷом нодуруст аст.'),
    payment_frequency: paymentFrequencySchema,
  })
  .refine((v) => new Date(v.due_date) > new Date(v.start_date), {
    message: 'Санаи анҷом бояд баъд аз санаи оғоз бошад.',
    path: ['due_date'],
  });
export type CalculateLoanInput = z.infer<typeof calculateLoanSchema>;

export const createLoanPaymentSchema = z.object({
  loan_id: z.string().uuid(),
  amount: z.number().positive().max(1_000_000_000),
  payment_date: z.string().date().optional(),
  note: z.string().trim().max(300).optional(),
});
export type CreateLoanPaymentInput = z.infer<typeof createLoanPaymentSchema>;
