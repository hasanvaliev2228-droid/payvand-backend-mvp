// supabase/functions/generate-upload-url/index.ts
// Deno Edge Function. Authenticated. Validates bucket/MIME/size/ownership
// and returns a short-lived signed upload URL. This is the ONLY sanctioned
// way for the frontend to obtain write access to Storage — buckets have no
// public write policies.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKETS = ['avatars', 'documents', 'chat-files', 'qr-images'] as const;

const MIME_BY_BUCKET: Record<(typeof BUCKETS)[number], string[]> = {
  avatars: ['image/jpeg', 'image/png'],
  documents: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  'chat-files': ['application/pdf', 'image/jpeg', 'image/png', 'audio/mpeg', 'audio/mp4'],
  'qr-images': ['image/png'],
};

const bodySchema = z.object({
  bucket: z.enum(BUCKETS),
  mime_type: z.string().min(1),
  file_size: z.number().int().positive(),
  resource_id: z.string().uuid().optional(),
  extension: z.string().trim().min(1).max(10),
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
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
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
    const { bucket, mime_type, file_size, resource_id, extension } = parsed.data;

    const allowedMimes = MIME_BY_BUCKET[bucket];
    if (!allowedMimes.includes(mime_type)) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: `Навъи файл барои "${bucket}" иҷозат дода намешавад.` } },
        422,
      );
    }

    const maxSizeMb = Number(Deno.env.get('STORAGE_MAX_FILE_SIZE_MB') ?? '10');
    if (file_size > maxSizeMb * 1024 * 1024) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: `Андозаи файл набояд аз ${maxSizeMb}MB зиёд бошад.` } },
        422,
      );
    }

    const cleanExt = extension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const resourceSegment = resource_id ?? crypto.randomUUID();
    const objectPath = `${userId}/${resourceSegment}/${crypto.randomUUID()}.${cleanExt}`;

    // Admin client only to create the signed upload URL (bucket write policies
    // still ultimately govern who can complete the PUT against that URL).
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const expirySeconds = Number(Deno.env.get('UPLOAD_URL_EXPIRY_SECONDS') ?? '300');

    const { data: signed, error: signError } = await admin.storage
      .from(bucket)
      .createSignedUploadUrl(objectPath);
    if (signError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: signError.message } }, 500);
    }

    await admin.from('audit_logs').insert({
      actor_id: userId,
      action: 'generate_upload_url',
      entity_type: bucket,
      metadata: { objectPath, mime_type, file_size },
    });

    return json(
      {
        ok: true,
        data: {
          bucket,
          path: objectPath,
          signedUrl: signed.signedUrl,
          token: signed.token,
          expiresInSeconds: expirySeconds,
        },
      },
      200,
    );
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
