// supabase/functions/send-message/index.ts
// Deno Edge Function. Authenticated. Explicit membership check (defense in
// depth alongside RLS). Supports text, image, voice, and file messages
// (WhatsApp/Telegram style), plus reply/forward. Attachment bytes are
// uploaded separately via supabase/functions/upload-chat-media — this
// function only ever receives the resulting `file_url` (or legacy
// `file_path`) metadata, never raw file bytes.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// message_type keeps the legacy 'audio' value for backward compatibility
// alongside the new 'voice' value — see supabase/migrations/015_chat_attachments.sql.
const messageTypeSchema = z.enum(['text', 'image', 'voice', 'file', 'audio', 'system']);

const bodySchema = z
  .object({
    conversation_id: z.string().uuid(),
    message_type: messageTypeSchema.default('text'),
    body: z.string().trim().max(4000).optional(),
    // Legacy generic-document path (still accepted).
    file_path: z.string().max(500).optional(),
    // New chat-media path, returned by upload-chat-media.
    file_url: z.string().max(500).optional(),
    file_name: z.string().trim().max(255).optional(),
    file_size: z.number().int().positive().optional(),
    mime_type: z.string().trim().max(150).optional(),
    voice_duration_seconds: z.number().int().positive().max(3600).optional(),
    reply_to_id: z.string().uuid().optional(),
    forwarded_from_id: z.string().uuid().optional(),
  })
  .refine((v) => (v.message_type === 'text' ? !!v.body : true), {
    message: 'Паёми матнӣ бояд текст дошта бошад.',
    path: ['body'],
  })
  .refine(
    (v) =>
      !['image', 'file', 'audio', 'voice'].includes(v.message_type) || !!v.file_path || !!v.file_url,
    {
      message: 'Паёми расм/файл/овозӣ бояд file_url (ё file_path) дошта бошад.',
      path: ['file_url'],
    },
  )
  .refine((v) => v.message_type !== 'voice' || v.voice_duration_seconds !== undefined, {
    message: 'Паёми овозӣ бояд voice_duration_seconds дошта бошад.',
    path: ['voice_duration_seconds'],
  })
  .refine((v) => v.message_type !== 'file' || !!v.file_name || !!v.file_path, {
    message: 'Паёми файлӣ бояд file_name дошта бошад.',
    path: ['file_name'],
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
    const senderId = userData.user.id;

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.', details: parsed.error.flatten() } },
        422,
      );
    }

    // Explicit membership check (RLS enforces this too; this gives a clean
    // 403 with a clear message instead of an opaque insert failure).
    const { data: membership } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', parsed.data.conversation_id)
      .eq('user_id', senderId)
      .maybeSingle();
    if (!membership) {
      return json({ ok: false, error: { code: 'FORBIDDEN', message: 'Шумо аъзои ин чат нестед.' } }, 403);
    }

    // If this message references a chat-media attachment (file_url), make
    // sure that object actually belongs to the sender — a user can only
    // ever attach media they themselves uploaded (upload-chat-media always
    // stores under {sender_id}/...).
    if (parsed.data.file_url && !parsed.data.file_url.startsWith(`${senderId}/`)) {
      return json(
        { ok: false, error: { code: 'FORBIDDEN', message: 'Файли замимашуда ба шумо тааллуқ надорад.' } },
        403,
      );
    }

    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert({ ...parsed.data, sender_id: senderId })
      .select('*')
      .single();
    if (insertError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: insertError.message } }, 500);
    }

    return json({ ok: true, data: message }, 201);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
