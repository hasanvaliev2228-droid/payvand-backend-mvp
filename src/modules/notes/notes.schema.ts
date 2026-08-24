import { z } from 'zod';

export const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(150),
  content: z.string().trim().max(20000).optional(),
  category: z.string().trim().max(80).optional(),
  is_private: z.boolean().default(true),
  reminder_at: z.string().datetime().optional(),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  content: z.string().trim().max(20000).optional(),
  category: z.string().trim().max(80).optional(),
  is_private: z.boolean().optional(),
  reminder_at: z.string().datetime().nullable().optional(),
});
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export const noteFilterSchema = z.object({
  category: z.string().trim().max(80).optional(),
  hasReminder: z.coerce.boolean().optional(),
});
export type NoteFilterInput = z.infer<typeof noteFilterSchema>;
