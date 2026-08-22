import { z } from 'zod';

export const languageSchema = z.enum(['tg', 'ru', 'en', 'zh']);

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
  avatar_path: z.string().max(500).optional(),
  language: languageSchema.optional(),
  city: z.string().trim().max(120).optional(),
  date_of_birth: z.string().date().optional(),
  bio: z.string().trim().max(500).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateUserSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  currency: z.string().length(3).optional(),
  biometric_enabled: z.boolean().optional(),
  notification_enabled: z.boolean().optional(),
  push_enabled: z.boolean().optional(),
  offline_sync_enabled: z.boolean().optional(),
});
export type UpdateUserSettingsInput = z.infer<typeof updateUserSettingsSchema>;

/** The raw PIN is validated and hashed client-adjacent (Edge Function), never stored raw. */
export const setPinSchema = z.object({
  pin: z
    .string()
    .regex(/^\d{4,6}$/, 'PIN бояд аз 4 то 6 рақам иборат бошад.'),
});
export type SetPinInput = z.infer<typeof setPinSchema>;
