// supabase/functions/list-employees/index.ts
// Deno Edge Function. Authenticated. Lists the CALLER's own employees.
// Accepts GET (query string) or POST (JSON body).
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  active: z.coerce.boolean().optional(),
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
    const ownerId = userData.user.id;

    let rawQuery: Record<string, unknown> = {};
    if (req.method === 'GET') {
      const url = new URL(req.url);
      rawQuery = Object.fromEntries(url.searchParams.entries());
    } else {
      rawQuery = (await req.json().catch(() => ({}))) ?? {};
    }

    const parsed = querySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.', details: parsed.error.flatten() } },
        422,
      );
    }
    const { page, pageSize, active } = parsed.data;

    let query = supabase.from('employees').select('*', { count: 'exact' }).eq('owner_id', ownerId);
    if (active !== undefined) query = query.eq('active', active);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, 500);
    }

    return json(
      {
        ok: true,
        data: {
          items: data ?? [],
          page,
          pageSize,
          total: count ?? 0,
          totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
        },
      },
      200,
    );
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
