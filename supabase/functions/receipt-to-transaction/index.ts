// Authenticated, user-confirmed OCR receipt → expense transaction conversion.
// OCR values are suggestions only: the client must send an explicit amount/title.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const schema = z.object({
  scan_id: z.string().uuid(),
  amount: z.number().positive().max(1_000_000_000),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('TJS'),
  title: z.string().trim().min(1).max(120),
  category_id: z.string().uuid().optional(),
  transaction_date: z.string().datetime().optional(),
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await anon.auth.getUser();
    if (userError || !userData.user)
      return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Ворид нашудаед.' } }, 401);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Маълумот нодуруст аст.',
            details: parsed.error.flatten(),
          },
        },
        422,
      );
    if (!req.headers.get('Idempotency-Key'))
      return json(
        {
          ok: false,
          error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key лозим аст.' },
        },
        422,
      );
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: allowed } = await admin.rpc('consume_rate_limit', {
      p_user_id: userData.user.id,
      p_scope: 'receipt_to_transaction',
      p_limit: 20,
      p_window_seconds: 60,
    });
    if (!allowed)
      return json(
        { ok: false, error: { code: 'RATE_LIMITED', message: 'Лутфан баъдтар кӯшиш кунед.' } },
        429,
      );
    const { data: scan } = await anon
      .from('document_scans')
      .select('id,transaction_id,status')
      .eq('id', parsed.data.scan_id)
      .maybeSingle();
    if (!scan)
      return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Скан ёфт нашуд.' } }, 404);
    if (scan.transaction_id) {
      const { data: existing } = await anon
        .from('transactions')
        .select('*')
        .eq('id', scan.transaction_id)
        .maybeSingle();
      return json({ ok: true, data: existing, replayed: true });
    }
    if (scan.status !== 'completed')
      return json(
        {
          ok: false,
          error: { code: 'SCAN_NOT_READY', message: 'Скан ҳанӯз барои тасдиқ омода нест.' },
        },
        409,
      );
    const { data: transaction, error: txError } = await anon
      .from('transactions')
      .insert({
        user_id: userData.user.id,
        type: 'expense',
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        title: parsed.data.title,
        category_id: parsed.data.category_id,
        transaction_date: parsed.data.transaction_date,
      })
      .select('*')
      .single();
    if (txError)
      return json(
        { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Transaction сабт нашуд.' } },
        500,
      );
    const { error: linkError } = await anon
      .from('document_scans')
      .update({ transaction_id: transaction.id })
      .eq('id', scan.id)
      .is('transaction_id', null);
    if (linkError)
      return json(
        { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Transaction пайваст нашуд.' } },
        500,
      );
    await admin.from('audit_logs').insert({
      actor_id: userData.user.id,
      action: 'receipt_to_transaction',
      entity_type: 'transaction',
      entity_id: transaction.id,
      metadata: { scan_id: scan.id },
    });
    return json({ ok: true, data: transaction }, 201);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
