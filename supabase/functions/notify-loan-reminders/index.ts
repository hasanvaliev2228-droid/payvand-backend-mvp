// supabase/functions/notify-loan-reminders/index.ts
// Deno Edge Function. SYSTEM/ADMIN-ONLY. Intended to run on a daily
// schedule (Supabase Cron Trigger — see docs/deployment.md) to:
//   1. Send a "payment due soon" reminder for active loans whose due_date
//      is within LOAN_REMINDER_DAYS_BEFORE days.
//   2. Flip active loans past their due_date to status = 'overdue' and
//      send an "overdue" notification.
// Every notification is deduplicated per day via a `dedupe_key` stored in
// notifications.data — re-running this function (e.g. a retried cron
// invocation) never sends the same reminder twice.
//
// Authorization: no interactive user is present for a scheduled job, so
// this function accepts EITHER a matching `x-cron-secret` header (compared
// against the CRON_SECRET env secret) OR a normal admin JWT (so an admin
// can trigger/test it manually from the dashboard). No RLS/ownership check
// is bypassed by this: the service-role client is used deliberately here
// because the job must read/notify ACROSS all owners, exactly like
// send-notification already does for a single admin-initiated notification.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';
import { renderTemplate, resolveLanguage, type SupportedLanguage } from '../send-notification/notification-templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Optional body: lets an admin override the reminder window when triggering
// this function manually (e.g. for testing); the scheduled cron invocation
// can simply POST an empty body and get the env-var default.
const bodySchema = z.object({
  reminder_days_before: z.number().int().min(0).max(90).optional(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function isAuthorized(req: Request, admin: ReturnType<typeof createClient>): Promise<boolean> {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  if (cronSecret && providedSecret && providedSecret === cronSecret) return true;

  // Fall back to a normal admin JWT, so an admin can trigger/test this
  // function manually (e.g. from the dashboard) without a cron secret.
  // Authorization header is checked the same way every other Edge Function
  // in this project checks it: via a scoped client's own auth.getUser().
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return false;
  const scoped = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await scoped.auth.getUser();
  if (userError || !userData.user) return false;
  const { data: profile } = await admin.from('profiles').select('role').eq('id', userData.user.id).single();
  return profile?.role === 'admin';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    if (!(await isAuthorized(req, admin))) {
      return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Дастрасӣ иҷозат нест.' } }, 401);
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.', details: parsed.error.flatten() } },
        422,
      );
    }

    const reminderDays = parsed.data.reminder_days_before ?? Number(Deno.env.get('LOAN_REMINDER_DAYS_BEFORE') ?? '3');
    const today = new Date().toISOString().slice(0, 10);
    const reminderThreshold = new Date(Date.now() + reminderDays * 86400000).toISOString().slice(0, 10);

    let remindersSent = 0;
    let overdueFlagged = 0;

    // --- 1. Upcoming payment reminders ---
    const { data: upcomingLoans, error: upcomingError } = await admin
      .from('loans')
      .select('id, owner_id, borrower_name, due_date, description')
      .eq('status', 'active')
      .gte('due_date', today)
      .lte('due_date', reminderThreshold);
    if (upcomingError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: upcomingError.message } }, 500);
    }

    for (const loan of upcomingLoans ?? []) {
      const dedupeKey = `loan_reminder:${loan.id}:${today}`;
      const { data: existing } = await admin
        .from('notifications')
        .select('id')
        .filter('data->>dedupe_key', 'eq', dedupeKey)
        .maybeSingle();
      if (existing) continue;

      const { data: ownerProfile } = await admin
        .from('profiles')
        .select('language')
        .eq('id', loan.owner_id)
        .maybeSingle();
      const lang: SupportedLanguage = resolveLanguage(null, ownerProfile?.language ?? null);
      const title = loan.description ?? loan.borrower_name;
      const rendered = renderTemplate('loan.payment_reminder', lang, { title, due_date: loan.due_date });
      if (!rendered) continue;

      await admin.from('notifications').insert({
        user_id: loan.owner_id,
        title: rendered.title,
        body: rendered.body,
        notification_type: 'loan_reminder',
        data: { dedupe_key: dedupeKey, loan_id: loan.id },
      });
      remindersSent++;
    }

    // --- 2. Overdue loans ---
    const { data: overdueLoans, error: overdueError } = await admin
      .from('loans')
      .select('id, owner_id, borrower_name, due_date, description')
      .eq('status', 'active')
      .lt('due_date', today);
    if (overdueError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: overdueError.message } }, 500);
    }

    for (const loan of overdueLoans ?? []) {
      await admin.from('loans').update({ status: 'overdue' }).eq('id', loan.id);

      const dedupeKey = `loan_overdue:${loan.id}:${today}`;
      const { data: existing } = await admin
        .from('notifications')
        .select('id')
        .filter('data->>dedupe_key', 'eq', dedupeKey)
        .maybeSingle();
      if (existing) continue;

      const { data: ownerProfile } = await admin
        .from('profiles')
        .select('language')
        .eq('id', loan.owner_id)
        .maybeSingle();
      const lang: SupportedLanguage = resolveLanguage(null, ownerProfile?.language ?? null);
      const title = loan.description ?? loan.borrower_name;
      const rendered = renderTemplate('loan.overdue', lang, { title });
      if (!rendered) continue;

      await admin.from('notifications').insert({
        user_id: loan.owner_id,
        title: rendered.title,
        body: rendered.body,
        notification_type: 'loan_overdue',
        data: { dedupe_key: dedupeKey, loan_id: loan.id },
      });
      overdueFlagged++;
    }

    await admin.from('audit_logs').insert({
      actor_id: null,
      action: 'notify_loan_reminders',
      entity_type: 'loan',
      metadata: { remindersSent, overdueFlagged, reminderDays },
    });

    return json({ ok: true, data: { remindersSent, overdueFlagged } }, 200);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
