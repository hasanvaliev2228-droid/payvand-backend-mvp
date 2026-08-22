// supabase/functions/send-message/index.ts
// Deno Edge Function. Authenticated. Explicit membership check (defense in
// depth alongside RLS), supports text/file/reply/forward and attachments.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const bodySchema = z
  .object({
    conversation_id: z.string().uuid(),

    message_type: z
      .enum([
        'text',
        'image',
        'voice',
        'file',
        'audio',
        'system',
      ])
      .default('text'),

    body: z.string().trim().max(4000).optional(),

    // legacy support
    file_path: z.string().max(500).optional(),

    // new attachment support
    file_url: z.string().max(500).optional(),
    file_name: z.string().max(255).optional(),
    file_size: z.number().optional(),
    mime_type: z.string().max(100).optional(),
    voice_duration_seconds: z.number().optional(),

    reply_to_id: z.string().uuid().optional(),
    forwarded_from_id: z.string().uuid().optional(),
  })
  .refine(
    (v) =>
      v.message_type === 'text'
        ? !!v.body
        : !!v.file_path || !!v.file_url,
    {
      message: 'Паём бояд ё матн ё файл дошта бошад.',
      path: ['body'],
    },
  );

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      },
    );

    const { data: userData, error: userError } =
      await supabase.auth.getUser();

    if (userError || !userData.user) {
      return json(
        {
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Ворид нашудаед.',
          },
        },
        401,
      );
    }

    const senderId = userData.user.id;

    const raw = await req.json().catch(() => null);

    const parsed = bodySchema.safeParse(raw);

    if (!parsed.success) {
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
    }


    // SECURITY:
    // User can only send files that belong to himself.
    if (
      parsed.data.file_url &&
      !parsed.data.file_url.startsWith(`${senderId}/`)
    ) {
      return json(
        {
          ok: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Файли замимашуда ба шумо тааллуқ надорад',
          },
        },
        403,
      );
    }


    // Explicit membership check
    const { data: membership } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', parsed.data.conversation_id)
      .eq('user_id', senderId)
      .maybeSingle();


    if (!membership) {
      return json(
        {
          ok: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Шумо аъзои ин чат нестед.',
          },
        },
        403,
      );
    }


    const { data: message, error: insertError } =
      await supabase
        .from('messages')
        .insert({
          ...parsed.data,
          sender_id: senderId,
        })
        .select('*')
        .single();


    if (insertError) {
      return json(
        {
          ok: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: insertError.message,
          },
        },
        500,
      );
    }


    return json(
      {
        ok: true,
        data: message,
      },
      201,
    );


  } catch {
    return json(
      {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Хатогии дохилӣ.',
        },
      },
      500,
    );
  }
});