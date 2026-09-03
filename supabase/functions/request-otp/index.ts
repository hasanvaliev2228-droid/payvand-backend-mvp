import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OTP_TTL_SECONDS = 300;
const RESEND_COOLDOWN_SECONDS = 60;

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

function createOtp() {
  const max = 1_000_000;
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % max);
  let randomValue: number;
  do randomValue = crypto.getRandomValues(new Uint32Array(1))[0];
  while (randomValue >= limit);
  return String(randomValue % max).padStart(6, '0');
}

function providerError(status: number, response: unknown) {
  const errorObject =
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    typeof response.error === 'object' &&
    response.error !== null
      ? response.error
      : null;
  const code = errorObject && 'code' in errorObject ? String(errorObject.code) : undefined;
  if (code === '119') {
    return json(
      {
        ok: false,
        error: 'SMS_PROVIDER_BALANCE',
        message: 'Хидмати SMS муваққатан дастрас нест',
      },
      503,
    );
  }
  if (code === '105' || code === '106' || code === '107' || code === '114') {
    return json(
      {
        ok: false,
        error: 'SMS_PROVIDER_CONFIGURATION',
        message: 'Хидмати SMS дуруст танзим нашудааст',
      },
      503,
    );
  }
  if (status >= 500) {
    return json(
      {
        ok: false,
        error: 'SMS_PROVIDER_UNAVAILABLE',
        message: 'Хидмати SMS муваққатан дастрас нест',
      },
      503,
    );
  }
  return json(
    {
      ok: false,
      error: 'SMS_PROVIDER_REJECTED',
      message: 'SMS фиристода нашуд',
      provider_code: code,
    },
    422,
  );
}

const requestSchema = z.object({ phone: z.string().trim().min(9).max(20) });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    const phone = parsed.success ? normalizeTajikPhone(parsed.data.phone) : null;
    if (!phone)
      return json(
        { ok: false, error: 'INVALID_PHONE', message: 'Рақами Тоҷикистон нодуруст аст' },
        400,
      );

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const token = Deno.env.get('OSONSMS_BEARER_TOKEN');
    const login = Deno.env.get('OSONSMS_LOGIN');
    const sender = Deno.env.get('OSONSMS_SENDER');
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('request-otp: Supabase service configuration is missing');
      return json({ ok: false, error: 'SERVER_CONFIGURATION' }, 500);
    }
    if (!token || !login || !sender) {
      console.error('request-otp: OsonSMS configuration is missing');
      return json(
        {
          ok: false,
          error: 'SMS_PROVIDER_CONFIGURATION',
          message: 'Хидмати SMS дуруст танзим нашудааст',
        },
        503,
      );
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const cooldownSince = new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000).toISOString();
    const { data: recent, error: recentError } = await supabase
      .from('otp_codes')
      .select('created_at')
      .eq('phone', phone)
      .gte('created_at', cooldownSince)
      .order('created_at', { ascending: false })
      .limit(1);
    if (recentError) {
      console.error('request-otp: OTP cooldown query failed', recentError.code);
      return json({ ok: false, error: 'OTP_STORAGE_UNAVAILABLE' }, 503);
    }
    if (recent?.length) {
      return json(
        {
          ok: false,
          error: 'OTP_RESEND_TOO_SOON',
          retry_after_seconds: RESEND_COOLDOWN_SECONDS,
        },
        429,
      );
    }

    const code = createOtp();
    const txnId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();
    const { data: otp, error: insertError } = await supabase
      .from('otp_codes')
      .insert({
        phone,
        code_hash: await sha256(code),
        expires_at: expiresAt,
        provider_txn_id: txnId,
      })
      .select('id')
      .maybeSingle();
    if (insertError || !otp) {
      console.error('request-otp: OTP insert failed', insertError?.code);
      return json({ ok: false, error: 'OTP_STORAGE_UNAVAILABLE' }, 503);
    }

    const smsUrl = new URL('https://api.osonsms.com/sendsms_v1.php');
    smsUrl.searchParams.set('login', login);
    smsUrl.searchParams.set('from', sender);
    smsUrl.searchParams.set('phone_number', phone);
    smsUrl.searchParams.set('msg', `Payvand: рамзи тасдиқи шумо ${code}`);
    smsUrl.searchParams.set('txn_id', txnId);
    smsUrl.searchParams.set('is_confidential', 'true');
    let smsResponse: Response;
    try {
      smsResponse = await fetch(smsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      console.error(
        'request-otp: OsonSMS network error',
        error instanceof Error ? error.name : 'unknown',
      );
      return json(
        {
          ok: false,
          error: 'SMS_PROVIDER_UNAVAILABLE',
          message: 'Хидмати SMS муваққатан дастрас нест',
        },
        503,
      );
    }
    const raw = await smsResponse.text();
    let providerResponse: unknown;
    try {
      providerResponse = JSON.parse(raw);
    } catch {
      providerResponse = { malformed_response: true };
    }
    const accepted =
      smsResponse.status === 201 &&
      typeof providerResponse === 'object' &&
      providerResponse !== null &&
      'status' in providerResponse &&
      providerResponse.status === 'ok';
    if (!accepted) {
      console.error('request-otp: OsonSMS rejected request', {
        status: smsResponse.status,
        providerResponse,
      });
      await supabase.from('otp_codes').delete().eq('id', otp.id);
      return providerError(smsResponse.status, providerResponse);
    }

    const { error: sentError } = await supabase
      .from('otp_codes')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', otp.id);
    if (sentError) {
      console.error('request-otp: OTP sent marker update failed', sentError.code);
      return json({ ok: false, error: 'OTP_STORAGE_UNAVAILABLE' }, 503);
    }

    return json({
      ok: true,
      message: 'OTP SMS фиристода шуд',
      expires_in_seconds: OTP_TTL_SECONDS,
    });
  } catch (error) {
    console.error('request-otp: unexpected error', error instanceof Error ? error.name : 'unknown');
    return json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
  }
});
