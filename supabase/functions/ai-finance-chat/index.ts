import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const schema = z.object({
  message: z.string().trim().min(1).max(2000),
  summary: z.record(z.unknown()).optional(),
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user)
      return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Ворид нашудаед.' } }, 401);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.' } },
        422,
      );
    // A provider must be explicitly configured as a server secret. This endpoint intentionally does not fabricate advice or use client-provided API keys.
    if (!Deno.env.get('AI_FINANCE_API_KEY'))
      return json({
        ok: true,
        data: {
          provider: 'mock',
          status: 'not_configured',
          message: 'AI provider is not configured.',
        },
      });
    return json(
      {
        ok: false,
        error: {
          code: 'PROVIDER_NOT_IMPLEMENTED',
          message: 'AI provider adapter needs a configured server-side implementation.',
        },
      },
      501,
    );
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
