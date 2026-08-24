/**
 * Employee attendance module tests. Same static-verification approach as
 * notes.test.ts / rls-ownership.test.ts: no live Supabase project in this
 * environment, so authorization/ownership is checked at the schema and
 * source level.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  attendanceReportFilterSchema,
  checkInSchema,
  checkOutSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
} from '../src/modules/employees/employees.schema';

const migrationSql = readFileSync(
  path.resolve(__dirname, '../supabase/migrations/017_employee_attendance.sql'),
  'utf-8',
);

const FUNCTIONS = {
  'create-employee': readFileSync(
    path.resolve(__dirname, '../supabase/functions/create-employee/index.ts'),
    'utf-8',
  ),
  'list-employees': readFileSync(
    path.resolve(__dirname, '../supabase/functions/list-employees/index.ts'),
    'utf-8',
  ),
  'check-in': readFileSync(path.resolve(__dirname, '../supabase/functions/check-in/index.ts'), 'utf-8'),
  'check-out': readFileSync(
    path.resolve(__dirname, '../supabase/functions/check-out/index.ts'),
    'utf-8',
  ),
  'attendance-report': readFileSync(
    path.resolve(__dirname, '../supabase/functions/attendance-report/index.ts'),
    'utf-8',
  ),
};

describe('Authorization: every attendance Edge Function requires a valid JWT', () => {
  for (const [name, source] of Object.entries(FUNCTIONS)) {
    it(`${name} checks Authorization and rejects with UNAUTHORIZED when auth.getUser() fails`, () => {
      expect(source).toMatch(/Authorization/);
      expect(source).toMatch(/auth\.getUser\(\)/);
      expect(source).toMatch(/UNAUTHORIZED/);
    });
  }
});

describe('RLS ownership (static policy audit)', () => {
  it('enables RLS on both employees and attendance', () => {
    expect(migrationSql).toMatch(/alter table public\.employees enable row level security;/);
    expect(migrationSql).toMatch(/alter table public\.attendance enable row level security;/);
  });

  it('scopes employees to owner_id = auth.uid()', () => {
    expect(migrationSql).toMatch(
      /create policy employees_owner_all on public\.employees\s*\n\s*for all using \(owner_id = auth\.uid\(\)\) with check \(owner_id = auth\.uid\(\)\);/,
    );
  });

  it('scopes attendance transitively through its parent employee\'s owner_id (no owner_id column of its own)', () => {
    const policyBlock = migrationSql.slice(migrationSql.indexOf('create policy attendance_owner_all'));
    expect(policyBlock).toMatch(/exists \(\s*select 1 from public\.employees e\s*\n\s*where e\.id = attendance\.employee_id and e\.owner_id = auth\.uid\(\)/);
  });

  it('attendance is private: the RLS policy never grants access based on anything other than the owning employer', () => {
    // Exactly one `exists (...)` ownership check on each side (using / with check).
    const policyBlock = migrationSql.slice(
      migrationSql.indexOf('create policy attendance_owner_all'),
    );
    const existsCount = (policyBlock.match(/exists \(/g) ?? []).length;
    expect(existsCount).toBe(2); // one for USING, one for WITH CHECK
  });

  it('check-in verifies the employee belongs to the caller before creating an attendance row', () => {
    expect(FUNCTIONS['check-in']).toMatch(/\.eq\('owner_id', ownerId\)/);
    expect(FUNCTIONS['check-in']).toMatch(/NOT_FOUND/);
  });

  it('list-employees and create-employee scope every query to the caller\'s owner_id', () => {
    expect(FUNCTIONS['create-employee']).toMatch(/owner_id: ownerId/);
    expect(FUNCTIONS['list-employees']).toMatch(/\.eq\('owner_id', ownerId\)/);
  });

  it('attendance-report only ever aggregates the caller\'s own employees', () => {
    expect(FUNCTIONS['attendance-report']).toMatch(/\.eq\('owner_id', ownerId\)/);
  });
});

describe('Validation', () => {
  it('createEmployeeSchema requires a non-empty name and defaults active to true', () => {
    expect(createEmployeeSchema.safeParse({ name: '' }).success).toBe(false);
    const result = createEmployeeSchema.parse({ name: 'Aли Ахмадов' });
    expect(result.active).toBe(true);
  });

  it('createEmployeeSchema rejects a negative salary', () => {
    expect(createEmployeeSchema.safeParse({ name: 'Aли', salary: -100 }).success).toBe(false);
  });

  it('updateEmployeeSchema accepts a partial update', () => {
    expect(updateEmployeeSchema.safeParse({ active: false }).success).toBe(true);
  });

  it('checkInSchema requires a valid employee_id (uuid)', () => {
    expect(checkInSchema.safeParse({ employee_id: 'not-a-uuid' }).success).toBe(false);
    expect(
      checkInSchema.safeParse({ employee_id: '11111111-1111-1111-1111-111111111111' }).success,
    ).toBe(true);
  });

  it('checkOutSchema requires a valid attendance_id (uuid)', () => {
    expect(checkOutSchema.safeParse({ attendance_id: 'not-a-uuid' }).success).toBe(false);
  });

  it('attendanceReportFilterSchema rejects a "to" date before "from"', () => {
    const result = attendanceReportFilterSchema.safeParse({ from: '2026-06-01', to: '2026-01-01' });
    expect(result.success).toBe(false);
  });

  it('attendanceReportFilterSchema accepts an empty filter (report for all employees, all time)', () => {
    expect(attendanceReportFilterSchema.safeParse({}).success).toBe(true);
  });
});

describe('CRUD operations (Edge Function shape)', () => {
  it('create-employee inserts with the caller as owner_id and returns the row', () => {
    expect(FUNCTIONS['create-employee']).toMatch(/owner_id: ownerId/);
    expect(FUNCTIONS['create-employee']).toMatch(/ok: true/);
  });

  it('list-employees supports pagination and an active filter', () => {
    expect(FUNCTIONS['list-employees']).toMatch(/page/);
    expect(FUNCTIONS['list-employees']).toMatch(/pageSize/);
    expect(FUNCTIONS['list-employees']).toMatch(/active/);
  });

  it('check-in rejects check-in for an inactive employee', () => {
    expect(FUNCTIONS['check-in']).toMatch(/employee\.active/);
    expect(FUNCTIONS['check-in']).toMatch(/Корманди ғайрифаъол наметавонад check-in кунад/);
  });

  it('check-out rejects double check-out and computes work_minutes', () => {
    expect(FUNCTIONS['check-out']).toMatch(/record\.check_out/);
    expect(FUNCTIONS['check-out']).toMatch(/CONFLICT/);
    expect(FUNCTIONS['check-out']).toMatch(/work_minutes/);
  });

  it('attendance-report aggregates totalMinutes and totalDays per employee', () => {
    expect(FUNCTIONS['attendance-report']).toMatch(/totalMinutes/);
    expect(FUNCTIONS['attendance-report']).toMatch(/totalDays/);
  });

  it('every attendance Edge Function returns the uniform { ok, ... } envelope', () => {
    for (const source of Object.values(FUNCTIONS)) {
      expect(source).toMatch(/ok: true/);
      expect(source).toMatch(/ok: false/);
    }
  });
});

describe('Database structure', () => {
  it('attendance.check_out must be null or on/after check_in', () => {
    expect(migrationSql).toMatch(
      /constraint attendance_check_out_after_check_in check \(check_out is null or check_out >= check_in\)/,
    );
  });

  it('employees.salary must be null or non-negative', () => {
    expect(migrationSql).toMatch(/salary numeric\(14, 2\) check \(salary is null or salary >= 0\)/);
  });

  it('attendance references employees with cascade delete', () => {
    expect(migrationSql).toMatch(/employee_id uuid not null references public\.employees\(id\) on delete cascade/);
  });
});
