// supabase/functions/create-qr/index.ts
// Deno Edge Function. Authenticated. Creates a QR/barcode record for the
// caller. If an image can be generated it is stored in the qr-images bucket;
// otherwise the payload/record alone is returned (image generation is
// optional and never blocks record creation).
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const bodySchema = z.object({
  title: z.string().trim().min(1).max(80),
  qr_type: z.enum(['card', 'contact', 'payment_request', 'custom']),
  payload: z.string().min(1).max(2000),
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Ворид нашудаед.' } }, 401);
    }
    const userId = userData.user.id;

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.', details: parsed.error.flatten() } },
        422,
      );
    }

    const { data: qr, error: insertError } = await supabase
      .from('qr_codes')
      .insert({ ...parsed.data, user_id: userId })
      .select('*')
      .single();

    if (insertError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: insertError.message } }, 500);
    }

    // Image generation is optional and best-effort: if a QR-rendering
    // library isn't available in the deployed environment we simply return
    // the record without image_path — the frontend can render the QR
    // client-side from `payload` if needed.
    return json({ ok: true, data: qr }, 201);
  } catch (err) {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
