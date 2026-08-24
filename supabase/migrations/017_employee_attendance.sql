-- 017_employee_attendance.sql
-- Employee attendance management. `employees` are owned by a profile (the
-- employer/manager using Payvand); `attendance` rows belong to an employee
-- and are reachable only through that employee's owner — mirroring the
-- loans/loan_payments ownership-through-parent pattern in 006_loans.sql and
-- its RLS in 014_rls_policies.sql.

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  phone text,
  position text,
  salary numeric(14, 2) check (salary is null or salary >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.employees is 'Employees managed by a Payvand user (owner_id). Not linked to auth.users — an employee need not have a Payvand account.';

create index employees_owner_id_idx on public.employees(owner_id);
create index employees_owner_active_idx on public.employees(owner_id, active);

create trigger set_updated_at before update on public.employees
  for each row execute function public.set_updated_at();

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  check_in timestamptz not null,
  check_out timestamptz,
  work_minutes integer check (work_minutes is null or work_minutes >= 0),
  date date not null default current_date,
  created_at timestamptz not null default now(),
  constraint attendance_check_out_after_check_in check (check_out is null or check_out >= check_in)
);

comment on table public.attendance is 'Per-day check-in/check-out records for an employee. Private to the employee''s owner — see RLS.';

create index attendance_employee_id_idx on public.attendance(employee_id);
create index attendance_employee_date_idx on public.attendance(employee_id, date desc);
-- An employee should have at most one OPEN (check_out is null) attendance
-- row at a time; enforced at the application layer (see attendance.service.ts
-- / check-in Edge Function) rather than a partial unique index, since a
-- genuinely corrected/re-opened record is a legitimate manual-edit case an
-- owner may need (e.g. fixing a forgotten check-out).

-- ============================================================
-- RLS
-- ============================================================
alter table public.employees enable row level security;

create policy employees_owner_all on public.employees
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.attendance enable row level security;

-- Attendance has no owner_id column of its own — ownership is transitive
-- through employees.owner_id, exactly like loan_payments → loans in
-- 014_rls_policies.sql. This also means attendance is private: only the
-- employee's owner can ever see it, never the employee's own auth.uid()
-- (employees are not required to have a Payvand account) and never a
-- different owner's staff.
create policy attendance_owner_all on public.attendance
  for all using (
    exists (
      select 1 from public.employees e
      where e.id = attendance.employee_id and e.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.employees e
      where e.id = attendance.employee_id and e.owner_id = auth.uid()
    )
  );
