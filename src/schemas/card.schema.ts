import { z } from 'zod';

export const createCardSchema = z.object({
  title: z.string().trim().min(1).max(80),
  bank_name: z.string().trim().min(1).max(120),
  cardholder_name: z.string().trim().max(120).optional(),
  // Only the last 4 digits are accepted; sensitive payment data has no field
  // in this schema.
  last4: z.string().regex(/^\d{4}$/, 'Танҳо 4 рақами охирини корт лозим аст.'),
  card_network: z.enum(['visa', 'mastercard', 'mir', 'unionpay', 'other']).optional(),
  color: z.string().max(20).optional(),
  is_default: z.boolean().optional(),
});
export type CreateCardInput = z.infer<typeof createCardSchema>;

export const updateCardSchema = createCardSchema.partial();
export type UpdateCardInput = z.infer<typeof updateCardSchema>;

export const qrTypeSchema = z.enum(['card', 'contact', 'payment_request', 'custom']);

export const createQrSchema = z.object({
  title: z.string().trim().min(1).max(80),
  qr_type: qrTypeSchema,
  payload: z.string().min(1).max(2000),
});
export type CreateQrInput = z.infer<typeof createQrSchema>;
