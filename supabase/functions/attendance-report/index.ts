// supabase/functions/attendance-report/index.ts
// Deno Edge Function. Authenticated. Aggregates attendance (total minutes,
// total days, raw records) per employee for the CALLER's own staff, with an
// optional employee/date-range filter. RLS scopes both `employees` and
// `attendance` to the caller regardless of what's requested.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const querySchema = z
  .object({
    employee_id: z.string().uuid().optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .refine((v) => !v.from || !v.to || v.to >= v.from, {
    message: 'Санаи анҷом бояд баъд аз санаи оғоз бошад.',
    path: ['to'],
  });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Ворид нашудаед.' } }, 401);
    }
    const ownerId = userData.user.id;

    let rawQuery: Record<string, unknown> = {};
    if (req.method === 'GET') {
      const url = new URL(req.url);
      rawQuery = Object.fromEntries(url.searchParams.entries());
    } else {
      rawQuery = (await req.json().catch(() => ({}))) ?? {};
    }

    const parsed = querySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.', details: parsed.error.flatten() } },
        422,
      );
    }
    const { employee_id, from, to } = parsed.data;

    let employeeQuery = supabase.from('employees').select('id, name').eq('owner_id', ownerId);
    if (employee_id) employeeQuery = employeeQuery.eq('id', employee_id);
    const { data: employees, error: employeesError } = await employeeQuery;
    if (employeesError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: employeesError.message } }, 500);
    }
    if (!employees || employees.length === 0) {
      return json({ ok: true, data: { report: [] } }, 200);
    }

    const employeeIds = employees.map((e) => e.id);
    let attendanceQuery = supabase.from('attendance').select('*').in('employee_id', employeeIds);
    if (from) attendanceQuery = attendanceQuery.gte('date', from);
    if (to) attendanceQuery = attendanceQuery.lte('date', to);

    const { data: records, error: attendanceError } = await attendanceQuery;
    if (attendanceError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: attendanceError.message } }, 500);
    }

    const report = employees.map((employee) => {
      const employeeRecords = (records ?? []).filter((r) => r.employee_id === employee.id);
      return {
        employee_id: employee.id,
        employee_name: employee.name,
        totalMinutes: employeeRecords.reduce((sum, r) => sum + (r.work_minutes ?? 0), 0),
        totalDays: new Set(employeeRecords.map((r) => r.date)).size,
        records: employeeRecords,
      };
    });

    return json({ ok: true, data: { report } }, 200);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
