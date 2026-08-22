import { z } from 'zod';

export const healthRecordTypeSchema = z.enum(['weight', 'blood_pressure', 'medicine', 'note']);

export const createHealthRecordSchema = z
  .object({
    record_type: healthRecordTypeSchema,
    value: z.number().optional(),
    unit: z.string().trim().max(20).optional(),
    systolic: z.number().int().min(40).max(300).optional(),
    diastolic: z.number().int().min(20).max(200).optional(),
    recorded_at: z.string().datetime().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine(
    (v) => v.record_type !== 'blood_pressure' || (v.systolic != null && v.diastolic != null),
    {
      message: 'Барои фишори хун systolic ва diastolic ҳатмист.',
      path: ['systolic'],
    },
  );
export type CreateHealthRecordInput = z.infer<typeof createHealthRecordSchema>;

export const updateHealthRecordSchema = z.object({
  value: z.number().optional(),
  unit: z.string().trim().max(20).optional(),
  systolic: z.number().int().min(40).max(300).optional(),
  diastolic: z.number().int().min(20).max(200).optional(),
  note: z.string().trim().max(500).optional(),
});
export type UpdateHealthRecordInput = z.infer<typeof updateHealthRecordSchema>;
