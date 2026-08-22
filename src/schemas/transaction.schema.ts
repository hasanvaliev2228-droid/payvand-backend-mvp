import { z } from 'zod';

export const categoryTypeSchema = z.enum(['income', 'expense']);

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: categoryTypeSchema,
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const transactionTypeSchema = z.enum(['income', 'expense', 'transfer']);

export const createTransactionSchema = z.object({
  category_id: z.string().uuid().optional(),
  type: transactionTypeSchema,
  amount: z.number().positive().max(1_000_000_000),
  currency: z.string().length(3).default('TJS'),
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).optional(),
  transaction_date: z.string().datetime().optional(),
  attachment_path: z.string().max(500).optional(),
});
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = createTransactionSchema.partial();
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export const transactionFilterSchema = z.object({
  type: transactionTypeSchema.optional(),
  category_id: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type TransactionFilterInput = z.infer<typeof transactionFilterSchema>;
