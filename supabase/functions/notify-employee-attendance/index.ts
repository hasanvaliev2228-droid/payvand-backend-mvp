// Scheduled attendance notifications for an employer's active employees.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';
import { renderTemplate, resolveLanguage } from '../send-notification/notification-templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const bodySchema = z.object({ late_after_hour: z.number().int().min(0).max(23).optional() });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

async function isAuthorized(req: Request, admin: ReturnType<typeof createClient>): Promise<boolean> {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) return true;
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return false;
  const scoped = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error } = await scoped.auth.getUser();
  if (error || !userData.user) return false;
  const { data: profile } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
  return profile?.role === 'admin';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (!(await isAuthorized(req, admin))) return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Дастрасӣ иҷозат нест.' } }, 401);
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.' } }, 422);

    const today = new Date().toISOString().slice(0, 10);
    const lateAfterHour = parsed.data.late_after_hour ?? 9;
    const { data: employees, error } = await admin.from('employees').select('id, owner_id, name').eq('active', true);
    if (error) throw error;
    let sent = 0;
    for (const employee of employees ?? []) {
      const { data: ownerProfile } = await admin.from('profiles').select('language').eq('id', employee.owner_id).maybeSingle();
      const lang = resolveLanguage(null, ownerProfile?.language ?? null);
      const { data: todayAttendance } = await admin.from('attendance').select('id, check_in').eq('employee_id', employee.id).eq('date', today).maybeSingle();
      const late = todayAttendance && new Date(todayAttendance.check_in).getHours() >= lateAfterHour;
      const templateKey = late ? 'employee.late_checkin' : 'employee.no_checkin';
      const dedupeKey = late ? `employee_late:${todayAttendance.id}` : `employee_no_checkin:${employee.id}:${today}`;
      const { data: existing } = await admin.from('notifications').select('id').filter('data->>dedupe_key', 'eq', dedupeKey).maybeSingle();
      if (existing) continue;
      const rendered = renderTemplate(templateKey, lang, { employee_name: employee.name, check_in_time: todayAttendance ? new Date(todayAttendance.check_in).toLocaleTimeString() : undefined });
      if (!rendered) continue;
      const { error: insertError } = await admin.from('notifications').insert({
        user_id: employee.owner_id,
        title: rendered.title,
        body: rendered.body,
        notification_type: late ? 'employee_late_checkin' : 'employee_no_checkin',
        data: { dedupe_key: dedupeKey, employee_id: employee.id },
      });
      if (insertError) throw insertError;
      sent++;
    }
    return json({ ok: true, data: { sent } });
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
