import { z } from 'zod';

/**
 * Dedicated theme-update schema for this module's focused API surface.
 * Intentionally only 'light' | 'dark' (per this feature request) — the
 * broader `updateUserSettingsSchema` (src/schemas/profile.schema.ts) still
 * accepts 'system' as well and is completely unaffected by this file.
 */
export const updateThemeSchema = z.object({
  theme: z.enum(['light', 'dark']),
});
export type UpdateThemeInput = z.infer<typeof updateThemeSchema>;
