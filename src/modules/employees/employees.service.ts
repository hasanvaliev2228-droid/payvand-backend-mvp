/**
 * Employee attendance module.
 * Security note: RLS scopes `employees` to owner_id (employees_owner_all,
 * 017_employee_attendance.sql) and `attendance` transitively through its
 * parent employee's owner_id (attendance_owner_all) — the same
 * ownership-through-parent pattern as loan_payments → loans
 * (src/modules/loans/loans.service.ts). Attendance has no owner_id of its
 * own and is never visible to anyone but the employee's owner.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import {
  deleteRowById,
  getRowById,
  insertRow,
  listRows,
  updateRowById,
} from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import { AppError } from '../../lib/errors';
import {
  checkInSchema,
  checkOutSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  type CheckInInput,
  type CheckOutInput,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
} from './employees.schema';
import type { AttendanceReportEntry, AttendanceRow, EmployeeRow } from './employees.types';
import type { ListResult } from '../../types/api.types';

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export async function listMyEmployees(
  client: SupabaseClient<Database>,
  ownerId: string,
  options: Omit<ListOptions, 'filters'> & { active?: boolean },
): Promise<ListResult<EmployeeRow>> {
  const { active, ...rest } = options;
  return listRows<EmployeeRow>(client, 'employees', {
    ...rest,
    filters: { owner_id: ownerId, active },
  });
}

export async function getMyEmployee(
  client: SupabaseClient<Database>,
  id: string,
): Promise<EmployeeRow> {
  return getRowById<EmployeeRow>(client, 'employees', id);
}

export async function createEmployee(
  client: SupabaseClient<Database>,
  ownerId: string,
  input: CreateEmployeeInput,
): Promise<EmployeeRow> {
  const values = parseOrThrow(createEmployeeSchema, input);
  return insertRow<EmployeeRow>(client, 'employees', { ...values, owner_id: ownerId });
}

export async function updateEmployee(
  client: SupabaseClient<Database>,
  id: string,
  input: UpdateEmployeeInput,
): Promise<EmployeeRow> {
  const values = parseOrThrow(updateEmployeeSchema, input);
  return updateRowById<EmployeeRow>(client, 'employees', id, values);
}

export async function deleteEmployee(client: SupabaseClient<Database>, id: string): Promise<void> {
  return deleteRowById(client, 'employees', id);
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

/**
 * Opens a new attendance record for an employee. Ownership of the employee
 * is verified explicitly (in addition to RLS) so a clear FORBIDDEN/NOT_FOUND
 * is returned instead of an opaque RLS insert failure.
 */
export async function checkIn(
  client: SupabaseClient<Database>,
  ownerId: string,
  input: CheckInInput,
): Promise<AttendanceRow> {
  const values = parseOrThrow(checkInSchema, input);

  const { data: employee } = await client
    .from('employees')
    .select('id, active')
    .eq('id', values.employee_id)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (!employee) throw AppError.notFound('Корманд ёфт нашуд.');
  if (!employee.active) throw AppError.validation('Корманди ғайрифаъол наметавонад check-in кунад.');

  const checkInAt = values.check_in ?? new Date().toISOString();
  return insertRow<AttendanceRow>(client, 'attendance', {
    employee_id: values.employee_id,
    check_in: checkInAt,
    date: checkInAt.slice(0, 10),
  });
}

/**
 * Closes an open attendance record and computes work_minutes.
 */
export async function checkOut(
  client: SupabaseClient<Database>,
  input: CheckOutInput,
): Promise<AttendanceRow> {
  const values = parseOrThrow(checkOutSchema, input);

  const { data: record } = await client
    .from('attendance')
    .select('*')
    .eq('id', values.attendance_id)
    .maybeSingle();
  if (!record) throw AppError.notFound('Сабти ҳузур ёфт нашуд.');
  if (record.check_out) throw AppError.conflict('Ин сабт аллакай check-out шудааст.');

  const checkOutAt = values.check_out ?? new Date().toISOString();
  const workMinutes = Math.max(
    0,
    Math.round((new Date(checkOutAt).getTime() - new Date(record.check_in).getTime()) / 60000),
  );

  return updateRowById<AttendanceRow>(client, 'attendance', values.attendance_id, {
    check_out: checkOutAt,
    work_minutes: workMinutes,
  });
}

export async function listAttendance(
  client: SupabaseClient<Database>,
  employeeId: string,
  options: Omit<ListOptions, 'filters'>,
): Promise<ListResult<AttendanceRow>> {
  return listRows<AttendanceRow>(client, 'attendance', {
    ...options,
    filters: { employee_id: employeeId },
  });
}

/**
 * Builds a per-employee attendance summary (total minutes worked, total
 * days recorded) across an optional date range. Only ever queries
 * employees/attendance the caller owns — enforced by RLS regardless of the
 * filters passed in.
 */
export async function attendanceReport(
  client: SupabaseClient<Database>,
  ownerId: string,
  filters: { employee_id?: string; from?: string; to?: string },
): Promise<AttendanceReportEntry[]> {
  let employeeQuery = client.from('employees').select('id, name').eq('owner_id', ownerId);
  if (filters.employee_id) employeeQuery = employeeQuery.eq('id', filters.employee_id);
  const { data: employees, error: employeesError } = await employeeQuery;
  if (employeesError) throw AppError.internal(employeesError.message);
  if (!employees || employees.length === 0) return [];

  const employeeIds = employees.map((e) => e.id);
  let attendanceQuery = client.from('attendance').select('*').in('employee_id', employeeIds);
  if (filters.from) attendanceQuery = attendanceQuery.gte('date', filters.from);
  if (filters.to) attendanceQuery = attendanceQuery.lte('date', filters.to);

  const { data: records, error: attendanceError } = await attendanceQuery;
  if (attendanceError) throw AppError.internal(attendanceError.message);

  return employees.map((employee) => {
    const employeeRecords = (records ?? []).filter((r) => r.employee_id === employee.id);
    return {
      employee_id: employee.id,
      employee_name: employee.name,
      totalMinutes: employeeRecords.reduce((sum, r) => sum + (r.work_minutes ?? 0), 0),
      totalDays: new Set(employeeRecords.map((r) => r.date)).size,
      records: employeeRecords,
    };
  });
}
