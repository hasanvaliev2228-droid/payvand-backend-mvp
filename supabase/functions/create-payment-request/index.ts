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
  amount: z.number().positive().max(1_000_000_000),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('TJS'),
  description: z.string().trim().max(280).optional(),
  expires_at: z.string().datetime().optional(),
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
async function sha256(value: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user)
      return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Ворид нашудаед.' } }, 401);
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: allowed } = await admin.rpc('consume_rate_limit', {
      p_user_id: userData.user.id,
      p_scope: 'create_payment_request',
      p_limit: 10,
      p_window_seconds: 60,
    });
    if (!allowed)
      return json(
        { ok: false, error: { code: 'RATE_LIMITED', message: 'Лутфан баъдтар кӯшиш кунед.' } },
        429,
      );
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
    const idempotencyKey = req.headers.get('Idempotency-Key');
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 200)
      return json(
        {
          ok: false,
          error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key лозим аст.' },
        },
        422,
      );
    const keyHash = await sha256(idempotencyKey);
    const { data, error } = await supabase
      .from('payment_requests')
      .upsert(
        { ...parsed.data, requester_id: userData.user.id, idempotency_key: keyHash },
        { onConflict: 'requester_id,idempotency_key', ignoreDuplicates: true },
      )
      .select('*')
      .maybeSingle();
    if (error)
      return json(
        { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Дархости пардохт сабт нашуд.' } },
        500,
      );
    if (data) {
      await admin.from('audit_logs').insert({
        actor_id: userData.user.id,
        action: 'create_payment_request',
        entity_type: 'payment_request',
        entity_id: data.id,
        metadata: { replayed: false },
      });
      return json({ ok: true, data, payment_uri: `payvand://payment-request/${data.id}` }, 201);
    }
    const { data: existing, error: lookupError } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('requester_id', userData.user.id)
      .eq('idempotency_key', keyHash)
      .single();
    if (lookupError)
      return json(
        { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Дархости пардохт сабт нашуд.' } },
        500,
      );
    return json({
      ok: true,
      data: existing,
      payment_uri: `payvand://payment-request/${existing.id}`,
      replayed: true,
    });
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
