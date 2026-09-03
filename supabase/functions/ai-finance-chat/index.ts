import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';
import { AiFinanceProviderError } from '../../../src/modules/ai/ai.types.ts';
import { GeminiFinanceProvider } from './gemini-finance.provider.ts';
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
    // GEMINI_API_KEY is a Supabase server secret. Client-supplied keys are never accepted.
    const provider = new GeminiFinanceProvider(Deno.env.get('GEMINI_API_KEY'));
    const result = await provider.analyze({
      summary: parsed.data.summary ?? {},
      question: parsed.data.message,
    });
    return json({
      ok: true,
      data: { provider: result.provider, status: result.status, message: result.text },
    });
  } catch (error) {
    if (error instanceof AiFinanceProviderError) {
      const status = error.code === 'RATE_LIMITED' ? 429 : error.code === 'INVALID_RESPONSE' ? 502 : 503;
      const message =
        error.code === 'RATE_LIMITED'
          ? 'Дархостҳо хеле зиёданд. Лутфан баъдтар кӯшиш кунед.'
          : 'Хидмати AI муваққатан дастрас нест.';
      return json({ ok: false, error: { code: error.code, message } }, status);
    }
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
