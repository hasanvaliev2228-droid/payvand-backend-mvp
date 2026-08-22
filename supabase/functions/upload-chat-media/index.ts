// supabase/functions/upload-chat-media/index.ts
// Deno Edge Function. Authenticated. Secure upload of chat attachments
// (images, voice recordings, files) into the private "chat-media" Storage
// bucket, WhatsApp/Telegram style. Runs entirely with the CALLER's own
// RLS-scoped client — no service role is needed to write the object itself,
// because storage policy `chat_media_insert_own`
// (supabase/migrations/015_chat_attachments.sql) already allows a user to
// insert objects under their own {user_id}/... prefix. The service role is
// used only for the best-effort audit-log entry, matching the pattern used
// by the other sensitive-action Edge Functions in this project.
//
// Mirrors the limits/allow-lists in src/schemas/chat-media.schema.ts —
// Edge Functions are deployed standalone (Deno, not bundled with src/), so
// the values are intentionally duplicated here rather than imported.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const ALLOWED_VOICE_MIME_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/wav'] as const;
const ALLOWED_FILE_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
const ALL_ALLOWED_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_VOICE_MIME_TYPES,
  ...ALLOWED_FILE_MIME_TYPES,
] as const;

type MediaKind = 'image' | 'voice' | 'file';

const MAX_SIZE_BYTES: Record<MediaKind, number> = {
  image: 10 * 1024 * 1024, // 10MB
  voice: 20 * 1024 * 1024, // 20MB
  file: 25 * 1024 * 1024, // 25MB
};

const FOLDER_BY_KIND: Record<MediaKind, string> = {
  image: 'images',
  voice: 'voice',
  file: 'files',
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

function kindForMimeType(mimeType: string): MediaKind | undefined {
  if ((ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return 'image';
  if ((ALLOWED_VOICE_MIME_TYPES as readonly string[]).includes(mimeType)) return 'voice';
  if ((ALLOWED_FILE_MIME_TYPES as readonly string[]).includes(mimeType)) return 'file';
  return undefined;
}

const bodySchema = z.object({
  conversation_id: z.string().uuid(),
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(ALL_ALLOWED_MIME_TYPES, {
    errorMap: () => ({ message: 'Навъи файл иҷозат дода намешавад.' }),
  }),
  file_base64: z.string().min(1),
  voice_duration_seconds: z.number().int().positive().max(3600).optional(),
});

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/[\x00-\x1f]/g, '').slice(0, 255).trim();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    // 1. Authentication.
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
    const { conversation_id, file_name, mime_type, file_base64, voice_duration_seconds } = parsed.data;

    // 2. Conversation membership (explicit check; RLS also protects the
    // underlying tables/objects independently — defense in depth).
    const { data: membership } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', conversation_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!membership) {
      return json({ ok: false, error: { code: 'FORBIDDEN', message: 'Шумо аъзои ин чат нестед.' } }, 403);
    }

    // 3. MIME type allow-list.
    const kind = kindForMimeType(mime_type);
    if (!kind) {
      return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Навъи файл иҷозат дода намешавад.' } }, 422);
    }

    // 4. Decode and enforce the per-kind size limit BEFORE touching Storage.
    let bytes: Uint8Array;
    try {
      bytes = decodeBase64ToBytes(file_base64);
    } catch {
      return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'file_base64 нодуруст аст.' } }, 422);
    }
    const maxBytes = MAX_SIZE_BYTES[kind];
    if (bytes.length === 0 || bytes.length > maxBytes) {
      return json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Андозаи файл набояд аз ${Math.round(maxBytes / (1024 * 1024))}MB зиёд бошад.`,
          },
        },
        422,
      );
    }

    // 5. Build the {user_id}/{images|voice|files}/{uuid}.{ext} storage path
    // (never the original filename — see docs/storage.md path convention).
    const extension = EXTENSION_BY_MIME[mime_type] ?? 'bin';
    const objectPath = `${userId}/${FOLDER_BY_KIND[kind]}/${crypto.randomUUID()}.${extension}`;

    // 6. Upload using the CALLER's own scoped client — storage policy
    // chat_media_insert_own permits this because the path starts with the
    // caller's own user_id.
    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(objectPath, bytes, { contentType: mime_type, upsert: false });
    if (uploadError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: uploadError.message } }, 500);
    }

    // 7. Best-effort audit log (service role required — regular users have
    // no insert policy on audit_logs). Failure to audit never fails the
    // upload itself.
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (serviceRoleKey) {
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);
      await admin.from('audit_logs').insert({
        actor_id: userId,
        action: 'upload_chat_media',
        entity_type: 'chat_media',
        metadata: {
          conversation_id,
          object_path: objectPath,
          mime_type,
          size: bytes.length,
          kind,
          voice_duration_seconds: voice_duration_seconds ?? null,
        },
      });
    }

    return json(
      {
        ok: true,
        data: {
          url: objectPath,
          file_name: sanitizeFilename(file_name),
          mime_type,
          size: bytes.length,
        },
      },
      201,
    );
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
