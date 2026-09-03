// supabase/functions/scan-document/index.ts
// Deno Edge Function. Authenticated. OCR + AI document scanning pipeline:
//
//   user uploads image/PDF -> Supabase Storage ("documents" bucket) ->
//   OCR/AI extraction -> validated structured data -> document_scans row
//
// Supports receipts, invoices, business documents, and personal documents.
// Uses the CALLER's own RLS-scoped client to upload (storage policy
// documents_owner_all-equivalent path-prefix rule from 014_rls_policies.sql
// already permits this) — no service role is needed for the upload or the
// document_scans insert, since RLS already scopes both to the caller.
//
// API key handling: OCR_API_KEY is read ONLY from Deno.env inside this
// function's own process; it is never included in the request, the
// response, or any log line.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { z } from 'npm:zod@3.23.8';
import { extractWithGoogleVision, OcrProviderError } from './google-vision.provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const bodySchema = z.object({
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(ALLOWED_MIME_TYPES, {
    errorMap: () => ({ message: 'Навъи файл барои сканкунӣ иҷозат дода намешавад.' }),
  }),
  file_base64: z.string().min(1),
  scan_type: z.enum(['receipt', 'invoice', 'business_document', 'personal_document']),
  document_id: z.string().uuid().optional(),
});

const extractedDataSchema = z.object({
  merchant_name: z.string().trim().max(200).optional(),
  amount: z.number().min(0).max(1_000_000_000).optional(),
  currency: z.string().trim().length(3).optional(),
  date: z.string().date().optional(),
  category: z.string().trim().max(80).optional(),
  raw_text: z.string().max(50_000).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

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

async function extractDocumentData(
  bytes: Uint8Array,
  mimeType: string,
  _scanType: string,
): Promise<{ provider: string; data: z.infer<typeof extractedDataSchema> }> {
  if (Deno.env.get('OCR_PROVIDER') !== 'google_vision')
    throw new OcrProviderError('NOT_CONFIGURED');
  return {
    provider: 'google_vision',
    data: await extractWithGoogleVision(bytes, mimeType, Deno.env.get('OCR_API_KEY')),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: { headers: { Authorization: authHeader } },
      },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Ворид нашудаед.' } }, 401);
    }
    const userId = userData.user.id;

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
    const { mime_type, file_base64, scan_type, document_id } = parsed.data;

    // If the caller references an existing document, confirm ownership
    // before linking a scan to it (RLS would reject the FK-adjacent write
    // anyway, but this gives a clean, explicit error).
    if (document_id) {
      const { data: doc } = await supabase
        .from('documents')
        .select('id')
        .eq('id', document_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!doc) {
        return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Ҳуҷҷат ёфт нашуд.' } }, 404);
      }
    }

    let bytes: Uint8Array;
    try {
      bytes = decodeBase64ToBytes(file_base64);
    } catch {
      return json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'file_base64 нодуруст аст.' } },
        422,
      );
    }
    if (bytes.length === 0 || bytes.length > MAX_SIZE_BYTES) {
      return json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Андозаи файл набояд аз ${MAX_SIZE_BYTES / (1024 * 1024)}MB зиёд бошад.`,
          },
        },
        422,
      );
    }

    const extension = EXTENSION_BY_MIME[mime_type] ?? 'bin';
    const scanId = crypto.randomUUID();
    const objectPath = `${userId}/scans/${scanId}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(objectPath, bytes, { contentType: mime_type, upsert: false });
    if (uploadError) {
      return json(
        { ok: false, error: { code: 'INTERNAL_ERROR', message: uploadError.message } },
        500,
      );
    }

    let status: 'completed' | 'failed' = 'completed';
    let provider =
      Deno.env.get('OCR_PROVIDER') === 'google_vision' ? 'google_vision' : 'not_configured';
    let extracted: z.infer<typeof extractedDataSchema> | undefined;
    let errorMessage: string | undefined;

    try {
      const result = await extractDocumentData(bytes, mime_type, scan_type);
      provider = result.provider;
      const validated = extractedDataSchema.safeParse(result.data);
      if (!validated.success) {
        // The provider returned something we don't trust the shape of —
        // fail the scan rather than storing unvalidated fields.
        status = 'failed';
        errorMessage = 'Натиҷаи OCR формати нодуруст дошт.';
      } else {
        extracted = validated.data;
      }
    } catch (err) {
      status = 'failed';
      // Do not disclose provider/internal failures to the client or store secrets.
      errorMessage =
        err instanceof OcrProviderError && err.code === 'NOT_CONFIGURED'
          ? 'OCR provider is not configured.'
          : err instanceof OcrProviderError && err.code === 'UNSUPPORTED_MEDIA'
            ? 'Configured OCR provider does not support this media type.'
            : 'OCR provider could not process the document.';
    }

    const { data: scan, error: insertError } = await supabase
      .from('document_scans')
      .insert({
        id: scanId,
        user_id: userId,
        document_id: document_id ?? null,
        file_path: objectPath,
        scan_type,
        provider,
        status,
        extracted_merchant_name: extracted?.merchant_name,
        extracted_amount: extracted?.amount,
        extracted_currency: extracted?.currency,
        extracted_date: extracted?.date,
        extracted_category: extracted?.category,
        raw_text: extracted?.raw_text,
        confidence: extracted?.confidence,
        error_message: errorMessage,
      })
      .select('*')
      .single();
    if (insertError) {
      return json(
        { ok: false, error: { code: 'INTERNAL_ERROR', message: insertError.message } },
        500,
      );
    }

    return json({ ok: true, data: scan }, 201);
  } catch {
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Хатогии дохилӣ.' } }, 500);
  }
});
