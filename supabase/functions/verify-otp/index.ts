import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_ATTEMPTS = 5;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeTajikPhone(value: string): string | null {
  let phone = value.replace(/\D/g, '');
  if (phone.length === 9) phone = `992${phone}`;
  return phone.startsWith('992') && phone.length === 12 ? phone : null;
}

async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const verifySchema = z.object({
  phone: z.string().trim().min(9).max(20),
  code: z.string().regex(/^\d{6}$/),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const parsed = verifySchema.safeParse(await req.json().catch(() => null));
    const phone = parsed.success ? normalizeTajikPhone(parsed.data.phone) : null;
    if (!phone) return json({ ok: false, error: 'INVALID_OTP_REQUEST' }, 400);
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('verify-otp: Supabase service configuration is missing');
      return json({ ok: false, error: 'SERVER_CONFIGURATION' }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data: otp, error } = await supabase
      .from('otp_codes')
      .select('id, code_hash, expires_at, attempts')
      .eq('phone', phone)
      .is('verified_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('verify-otp: OTP lookup failed', error.code);
      return json({ ok: false, error: 'OTP_STORAGE_UNAVAILABLE' }, 503);
    }
    if (!otp) return json({ ok: false, error: 'OTP_NOT_FOUND_OR_EXPIRED' }, 400);
    if (otp.attempts >= MAX_ATTEMPTS)
      return json({ ok: false, error: 'OTP_TOO_MANY_ATTEMPTS' }, 429);
    if ((await sha256(parsed.data.code)) !== otp.code_hash) {
      const { error: attemptsError } = await supabase
        .from('otp_codes')
        .update({ attempts: otp.attempts + 1 })
        .eq('id', otp.id)
        .eq('attempts', otp.attempts);
      if (attemptsError) {
        console.error('verify-otp: attempt update failed', attemptsError.code);
        return json({ ok: false, error: 'OTP_STORAGE_UNAVAILABLE' }, 503);
      }
      return json({ ok: false, error: 'INVALID_OTP' }, 400);
    }
    const { data: verified, error: verifyError } = await supabase
      .from('otp_codes')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', otp.id)
      .is('verified_at', null)
      .select('id')
      .maybeSingle();
    if (verifyError) {
      console.error('verify-otp: verification update failed', verifyError.code);
      return json({ ok: false, error: 'OTP_STORAGE_UNAVAILABLE' }, 503);
    }
    if (!verified) return json({ ok: false, error: 'OTP_ALREADY_USED' }, 409);
    return json({ ok: true, success: true, message: 'OTP verified', phone });
  } catch (error) {
    console.error('verify-otp: unexpected error', error instanceof Error ? error.name : 'unknown');
    return json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
  }
});
