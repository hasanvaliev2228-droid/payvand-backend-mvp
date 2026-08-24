import { z } from 'zod';

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).optional(),
  position: z.string().trim().max(80).optional(),
  salary: z.number().min(0).max(1_000_000_000).optional(),
  active: z.boolean().default(true),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  position: z.string().trim().max(80).optional(),
  salary: z.number().min(0).max(1_000_000_000).optional(),
  active: z.boolean().optional(),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const checkInSchema = z.object({
  employee_id: z.string().uuid(),
  check_in: z.string().datetime().optional(), // defaults to "now" if omitted
});
export type CheckInInput = z.infer<typeof checkInSchema>;

export const checkOutSchema = z.object({
  attendance_id: z.string().uuid(),
  check_out: z.string().datetime().optional(), // defaults to "now" if omitted
});
export type CheckOutInput = z.infer<typeof checkOutSchema>;

export const attendanceReportFilterSchema = z
  .object({
    employee_id: z.string().uuid().optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .refine((v) => !v.from || !v.to || v.to >= v.from, {
    message: 'Санаи анҷом бояд баъд аз санаи оғоз бошад.',
    path: ['to'],
  });
export type AttendanceReportFilterInput = z.infer<typeof attendanceReportFilterSchema>;
