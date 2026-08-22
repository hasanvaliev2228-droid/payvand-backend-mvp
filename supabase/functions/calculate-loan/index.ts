// supabase/functions/calculate-loan/index.ts
// Deno Edge Function. Authenticated. Pure calculation endpoint — does not
// write to the database. Mirrors src/modules/loans/loan-calculator.ts so the
// frontend can preview a schedule before committing to createLoan().
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const bodySchema = z
  .object({
    principal_amount: z.number().positive(),
    interest_rate: z.number().min(0).max(1000),
    start_date: z.string().date(),
    due_date: z.string().date(),
    payment_frequency: z.enum(['once', 'weekly', 'monthly', 'quarterly']),
  })
  .refine((v) => new Date(v.due_date) > new Date(v.start_date), {
    message: 'Санаи анҷом бояд баъд аз санаи оғоз бошад.',
    path: ['due_date'],
  });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

const FREQUENCY_DAYS: Record<string, number> = { once: Infinity, weekly: 7, monthly: 30, quarterly: 90 };
const round2 = (n: number) => Math.round(n * 100) / 100;

function calculate(input: z.infer<typeof bodySchema>) {
  const totalDays = Math.round(
    (new Date(input.due_date).getTime() - new Date(input.start_date).getTime()) / (1000 * 60 * 60 * 24),
  );
  const years = totalDays / 365;
  const totalInterest = round2(input.principal_amount * (input.interest_rate / 100) * years);
  const totalPayable = round2(input.principal_amount + totalInterest);
  const stepDays = FREQUENCY_DAYS[input.payment_frequency];
  const installmentCount = stepDays === Infinity ? 1 : Math.max(1, Math.ceil(totalDays / stepDays));
  const installmentAmount = round2(totalPayable / installmentCount);

  const schedule: { due_date: string; amount: number }[] = [];
  const startMs = new Date(input.start_date).getTime();
  for (let i = 1; i <= installmentCount; i++) {
    const isLast = i === installmentCount;
    const dueMs =
      stepDays === Infinity
        ? new Date(input.due_date).getTime()
        : startMs + Math.min(i * stepDays, totalDays) * 24 * 60 * 60 * 1000;
    const amount = isLast ? round2(totalPayable - installmentAmount * (installmentCount - 1)) : installmentAmount;
    schedule.push({ due_date: new Date(dueMs).toISOString().slice(0, 10), amount });
  }
  return { totalInterest, totalPayable, installmentCount, installmentAmount, schedule };
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

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Маълумот нодуруст аст.', details: parsed.error.flatten() } },
        422,
      );
    }

    return json({ ok: true, data: calculate(parsed.data) }, 200);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
