// supabase/functions/upload-document/index.ts
// Deno Edge Function. Authenticated. Registers document METADATA after the
// client has already uploaded bytes to Storage via generate-upload-url.
// Sanitizes the original filename, verifies ownership of the target path,
// and never trusts a client-supplied storage key.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const bodySchema = z.object({
  title: z.string().trim().min(1).max(150),
  original_filename: z.string().trim().min(1).max(255),
  mime_type: z.enum([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]),
  file_size: z.number().int().positive(),
  file_path: z.string().min(1).max(500),
  folder: z.string().trim().max(80).default('general'),
  document_type: z.string().trim().max(80).optional(),
  is_private: z.boolean().default(true),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/[\x00-\x1f]/g, '').slice(0, 255).trim();
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

    // The storage path MUST start with the caller's own user_id — this is
    // the same rule enforced by the Storage bucket policy itself, checked
    // again here defensively before we trust the metadata.
    if (!parsed.data.file_path.startsWith(`${userId}/`)) {
      return json({ ok: false, error: { code: 'FORBIDDEN', message: 'Роҳи файл ба шумо тааллуқ надорад.' } }, 403);
    }

    const maxSizeMb = Number(Deno.env.get('STORAGE_MAX_FILE_SIZE_MB') ?? '10');
    if (parsed.data.file_size > maxSizeMb * 1024 * 1024) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: `Андозаи файл набояд аз ${maxSizeMb}MB зиёд бошад.` } },
        422,
      );
    }

    const storedFilename = sanitizeFilename(`${parsed.data.title}${parsed.data.original_filename.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ''}`);

    const { data: doc, error: insertError } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        title: parsed.data.title,
        original_filename: sanitizeFilename(parsed.data.original_filename),
        stored_filename: storedFilename,
        file_path: parsed.data.file_path,
        mime_type: parsed.data.mime_type,
        file_size: parsed.data.file_size,
        folder: parsed.data.folder,
        document_type: parsed.data.document_type,
        is_private: parsed.data.is_private,
        scan_status: 'pending_scan', // No antivirus integration configured; mock/pending by design.
      })
      .select('*')
      .single();

    if (insertError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: insertError.message } }, 500);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await admin.from('audit_logs').insert({
      actor_id: userId,
      action: 'upload_document',
      entity_type: 'document',
      entity_id: doc.id,
      metadata: { file_path: doc.file_path, mime_type: doc.mime_type },
    });

    return json({ ok: true, data: doc }, 201);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
