// supabase/functions/check-out/index.ts
// Deno Edge Function. Authenticated. Closes an open attendance record and
// computes work_minutes. RLS (attendance_owner_all) already prevents a
// caller from reading/updating another owner's attendance row; the
// .eq('employee_id', ...) join-through-select below is what actually
// resolves the row before we compute the duration.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const bodySchema = z.object({
  attendance_id: z.string().uuid(),
  check_out: z.string().datetime().optional(),
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

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.', details: parsed.error.flatten() } },
        422,
      );
    }

    // RLS (attendance_owner_all) already scopes this select to attendance
    // rows whose employee is owned by the caller — a non-owner gets `null`
    // here exactly as if the row didn't exist.
    const { data: record } = await supabase
      .from('attendance')
      .select('*')
      .eq('id', parsed.data.attendance_id)
      .maybeSingle();
    if (!record) {
      return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Сабти ҳузур ёфт нашуд.' } }, 404);
    }
    if (record.check_out) {
      return json({ ok: false, error: { code: 'CONFLICT', message: 'Ин сабт аллакай check-out шудааст.' } }, 409);
    }

    const checkOutAt = parsed.data.check_out ?? new Date().toISOString();
    const workMinutes = Math.max(
      0,
      Math.round((new Date(checkOutAt).getTime() - new Date(record.check_in).getTime()) / 60000),
    );

    const { data: updated, error: updateError } = await supabase
      .from('attendance')
      .update({ check_out: checkOutAt, work_minutes: workMinutes })
      .eq('id', parsed.data.attendance_id)
      .select('*')
      .single();
    if (updateError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: updateError.message } }, 500);
    }

    return json({ ok: true, data: updated }, 200);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
