// supabase/functions/check-in/index.ts
// Deno Edge Function. Authenticated. Opens a new attendance record for one
// of the CALLER's OWN employees. Ownership of the employee is verified
// explicitly (defense in depth alongside RLS) before any attendance row is
// created — attendance has no owner_id of its own, so this check is the
// only thing standing between "any authenticated user" and "the actual
// employer" at the moment of insert.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const bodySchema = z.object({
  employee_id: z.string().uuid(),
  check_in: z.string().datetime().optional(),
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

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.', details: parsed.error.flatten() } },
        422,
      );
    }

    // Ownership check: the employee must belong to the caller AND be active.
    const { data: employee } = await supabase
      .from('employees')
      .select('id, active')
      .eq('id', parsed.data.employee_id)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (!employee) {
      return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Корманд ёфт нашуд.' } }, 404);
    }
    if (!employee.active) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Корманди ғайрифаъол наметавонад check-in кунад.' } },
        422,
      );
    }

    const checkInAt = parsed.data.check_in ?? new Date().toISOString();
    const { data: attendance, error: insertError } = await supabase
      .from('attendance')
      .insert({
        employee_id: parsed.data.employee_id,
        check_in: checkInAt,
        date: checkInAt.slice(0, 10),
      })
      .select('*')
      .single();
    if (insertError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: insertError.message } }, 500);
    }

    return json({ ok: true, data: attendance }, 201);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
