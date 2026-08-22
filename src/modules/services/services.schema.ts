import { z } from 'zod';

export const createServiceProviderSchema = z.object({
  name: z.string().trim().min(1).max(150),
  category: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(255).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  description: z.string().trim().max(1000).optional(),
});
export type CreateServiceProviderInput = z.infer<typeof createServiceProviderSchema>;

export const updateServiceProviderStatusSchema = z.object({
  status: z.enum(['pending', 'active', 'blocked']),
});
export type UpdateServiceProviderStatusInput = z.infer<typeof updateServiceProviderStatusSchema>;
