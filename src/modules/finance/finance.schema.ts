import { z } from 'zod';
export const financePeriodSchema = z
  .object({ from: z.string().date(), to: z.string().date() })
  .refine((v) => v.from <= v.to, { message: 'Оғози давра бояд пеш аз анҷом бошад.' });
export const paymentRequestSchema = z.object({
  amount: z.number().positive().max(1_000_000_000),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('TJS'),
  description: z.string().trim().max(280).optional(),
  expires_at: z.string().datetime().optional(),
});
export type PaymentRequestInput = z.infer<typeof paymentRequestSchema>;
