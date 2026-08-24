/**
 * Employee attendance module types, sourced from the generated Database
 * types — see notes/notes.types.ts for the same pattern.
 */
import type { Database } from '../../types/database.types';

export type EmployeeRow = Database['public']['Tables']['employees']['Row'];
export type EmployeeInsert = Database['public']['Tables']['employees']['Insert'];
export type EmployeeUpdate = Database['public']['Tables']['employees']['Update'];

export type AttendanceRow = Database['public']['Tables']['attendance']['Row'];
export type AttendanceInsert = Database['public']['Tables']['attendance']['Insert'];
export type AttendanceUpdate = Database['public']['Tables']['attendance']['Update'];

export interface AttendanceReportEntry {
  employee_id: string;
  employee_name: string;
  totalMinutes: number;
  totalDays: number;
  records: AttendanceRow[];
}
