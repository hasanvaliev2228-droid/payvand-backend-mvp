import { z } from 'zod';

export const createContactSchema = z.object({
  display_name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).optional(),
  contact_user_id: z.string().uuid().optional(),
  avatar_path: z.string().max(500).optional(),
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = createContactSchema.partial();
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
