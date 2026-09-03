import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const schema = z
  .object({ from: z.string().date(), to: z.string().date() })
  .refine((v) => v.from <= v.to);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
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
    if (userError || !userData.user)
      return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Ворид нашудаед.' } }, 401);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.' } },
        422,
      );
    const { data: rows, error } = await supabase
      .from('transactions')
      .select('type,amount,category_id')
      .gte('transaction_date', parsed.data.from)
      .lte('transaction_date', `${parsed.data.to}T23:59:59.999Z`);
    if (error)
      return json(
        { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Маълумоти молиявӣ хонда нашуд.' } },
        500,
      );
    let income = 0;
    let expenses = 0;
    for (const row of rows ?? []) {
      if (row.type === 'income') income += Number(row.amount);
      else if (row.type === 'expense') expenses += Number(row.amount);
    }
    const savingsRate = income ? (income - expenses) / income : null;
    const healthScore =
      savingsRate === null ? null : Math.max(0, Math.min(100, Math.round(50 + savingsRate * 100)));
    const summary = {
      income,
      expenses,
      net_cash_flow: income - expenses,
      savings_rate: savingsRate,
      data_quality: 'transaction_history_only',
    };
    const { data: insight, error: saveError } = await supabase
      .from('finance_insights')
      .upsert(
        {
          user_id: userData.user.id,
          period_start: parsed.data.from,
          period_end: parsed.data.to,
          health_score: healthScore,
          summary,
          provider: 'deterministic',
        },
        { onConflict: 'user_id,period_start,period_end,provider' },
      )
      .select('*')
      .single();
    if (saveError)
      return json(
        { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Таҳлил сабт нашуд.' } },
        500,
      );
    return json({ ok: true, data: insight });
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
