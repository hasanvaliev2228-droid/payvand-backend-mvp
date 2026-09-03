import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';
import { BarcodeProviderError, lookupOpenFoodFacts } from './open-food-facts.provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const schema = z.object({
  barcode: z
    .string()
    .trim()
    .regex(/^\d{8,14}$/, 'Barcode must be 8–14 digits.'),
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
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await userClient.auth.getUser();
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
    if (Deno.env.get('BARCODE_PROVIDER') !== 'open_food_facts')
      return json(
        {
          ok: false,
          error: {
            code: 'PROVIDER_NOT_CONFIGURED',
            message: 'Barcode provider is not configured.',
          },
        },
        503,
      );
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: allowed } = await admin.rpc('consume_rate_limit', {
      p_user_id: userData.user.id,
      p_scope: 'barcode_lookup',
      p_limit: 30,
      p_window_seconds: 60,
    });
    if (!allowed)
      return json(
        { ok: false, error: { code: 'RATE_LIMITED', message: 'Лутфан баъдтар кӯшиш кунед.' } },
        429,
      );
    const product = await lookupOpenFoodFacts(parsed.data.barcode);
    return json({
      ok: true,
      data: { provider: 'open_food_facts', barcode: parsed.data.barcode, product },
    });
  } catch (error) {
    if (error instanceof BarcodeProviderError) {
      const status =
        error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID_RESPONSE' ? 502 : 503;
      return json(
        {
          ok: false,
          error: {
            code: error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'PROVIDER_UNAVAILABLE',
            message:
              error.code === 'NOT_FOUND' ? 'Маҳсулот ёфт нашуд.' : 'Barcode provider дастрас нест.',
          },
        },
        status,
      );
    }
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
