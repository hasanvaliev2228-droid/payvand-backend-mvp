import { z } from 'zod';

export const calendarEventTypeSchema = z.enum(['task', 'reminder', 'payment', 'health', 'other']);

export const createCalendarEventSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    description: z.string().trim().max(1000).optional(),
    event_type: calendarEventTypeSchema,
    start_at: z.string().datetime(),
    end_at: z.string().datetime().optional(),
    reminder_minutes: z.number().int().min(0).max(10080).optional(),
  })
  .refine((v) => !v.end_at || new Date(v.end_at) >= new Date(v.start_at), {
    message: 'Вақти анҷом бояд баъд аз вақти оғоз бошад.',
    path: ['end_at'],
  });
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;

export const updateCalendarEventSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(1000).optional(),
  event_type: calendarEventTypeSchema.optional(),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().optional(),
  reminder_minutes: z.number().int().min(0).max(10080).optional(),
  is_completed: z.boolean().optional(),
});
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;
