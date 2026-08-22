// supabase/functions/create-conversation/index.ts
// Deno Edge Function. Authenticated. Runs under the service role because it
// needs to add OTHER users as conversation_members (a plain RLS client can
// only ever insert itself — see conversation_members_insert_self). Also
// guarantees no duplicate direct conversation is created between the same
// two users, via the unique (user_a, user_b) index on
// direct_conversation_pairs.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const bodySchema = z.object({
  type: z.enum(['direct', 'group']),
  title: z.string().trim().min(1).max(120).optional(),
  member_ids: z.array(z.string().uuid()).min(1).max(256),
  image_path: z.string().max(500).optional(),
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
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await anon.auth.getUser();
    if (userError || !userData.user) {
      return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Ворид нашудаед.' } }, 401);
    }
    const callerId = userData.user.id;

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.', details: parsed.error.flatten() } },
        422,
      );
    }
    const { type, title, member_ids, image_path } = parsed.data;

    if (type === 'group' && !title) {
      return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Гурӯҳ бояд ном дошта бошад.' } }, 422);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Validate every target member exists.
    const uniqueMemberIds = Array.from(new Set([...member_ids, callerId]));
    const { data: existingProfiles, error: profilesError } = await admin
      .from('profiles')
      .select('id')
      .in('id', uniqueMemberIds);
    if (profilesError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: profilesError.message } }, 500);
    }
    if ((existingProfiles ?? []).length !== uniqueMemberIds.length) {
      return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Яке аз аъзоён вуҷуд надорад.' } }, 422);
    }

    if (type === 'direct') {
      if (uniqueMemberIds.length !== 2) {
        return json(
          { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Чат бо ду нафар танҳо аз 2 корбар иборат аст.' } },
          422,
        );
      }
      const [userA, userB] = [...uniqueMemberIds].sort();

      const { data: existingPair } = await admin
        .from('direct_conversation_pairs')
        .select('conversation_id')
        .eq('user_a', userA)
        .eq('user_b', userB)
        .maybeSingle();

      if (existingPair) {
        const { data: existingConversation } = await admin
          .from('conversations')
          .select('*')
          .eq('id', existingPair.conversation_id)
          .single();
        return json({ ok: true, data: existingConversation, alreadyExisted: true }, 200);
      }

      const { data: conversation, error: convError } = await admin
        .from('conversations')
        .insert({ type: 'direct', created_by: callerId, image_path })
        .select('*')
        .single();
      if (convError) {
        return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: convError.message } }, 500);
      }

      await admin.from('direct_conversation_pairs').insert({
        conversation_id: conversation.id,
        user_a: userA,
        user_b: userB,
      });

      await admin.from('conversation_members').insert(
        uniqueMemberIds.map((uid) => ({
          conversation_id: conversation.id,
          user_id: uid,
          member_role: uid === callerId ? 'owner' : 'member',
        })),
      );

      await admin.from('audit_logs').insert({
        actor_id: callerId,
        action: 'create_conversation',
        entity_type: 'conversation',
        entity_id: conversation.id,
        metadata: { type: 'direct' },
      });

      return json({ ok: true, data: conversation }, 201);
    }

    // Group conversation.
    const { data: conversation, error: convError } = await admin
      .from('conversations')
      .insert({ type: 'group', title, created_by: callerId, image_path })
      .select('*')
      .single();
    if (convError) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: convError.message } }, 500);
    }

    await admin.from('conversation_members').insert(
      uniqueMemberIds.map((uid) => ({
        conversation_id: conversation.id,
        user_id: uid,
        member_role: uid === callerId ? 'owner' : 'member',
      })),
    );

    await admin.from('audit_logs').insert({
      actor_id: callerId,
      action: 'create_conversation',
      entity_type: 'conversation',
      entity_id: conversation.id,
      metadata: { type: 'group', memberCount: uniqueMemberIds.length },
    });

    return json({ ok: true, data: conversation }, 201);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
