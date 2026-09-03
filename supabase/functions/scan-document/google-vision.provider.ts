export type OcrExtraction = {
  merchant_name?: string;
  amount?: number;
  currency?: string;
  date?: string;
  raw_text?: string;
  confidence?: number;
};

export class OcrProviderError extends Error {
  constructor(
    readonly code: 'NOT_CONFIGURED' | 'UNSUPPORTED_MEDIA' | 'UPSTREAM_ERROR' | 'INVALID_RESPONSE',
  ) {
    super(code);
  }
}

type VisionResponse = {
  responses?: Array<{
    fullTextAnnotation?: { text?: string; pages?: Array<{ confidence?: number }> };
    error?: { message?: string };
  }>;
};

const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const DATE_PATTERN = /\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.]([0-2]\d|3[01])\b/;
const AMOUNT_PATTERN = /(?:total|итого|ҳамагӣ|сумма)\D{0,20}(\d{1,9}(?:[.,]\d{1,2})?)/i;

function normalize(text: string): OcrExtraction {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const amountMatch = text.match(AMOUNT_PATTERN);
  const dateMatch = text.match(DATE_PATTERN);
  const amount = amountMatch ? Number(amountMatch[1].replace(',', '.')) : undefined;
  return {
    merchant_name: lines[0]?.slice(0, 200),
    amount: Number.isFinite(amount) ? amount : undefined,
    date: dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : undefined,
    raw_text: text.slice(0, 50_000),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  // Avoid spreading a multi-megabyte Uint8Array into String.fromCharCode().
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/** Google Cloud Vision DOCUMENT_TEXT_DETECTION adapter. The API key stays in a Supabase secret. */
export async function extractWithGoogleVision(
  bytes: Uint8Array,
  mimeType: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<OcrExtraction> {
  if (!apiKey) throw new OcrProviderError('NOT_CONFIGURED');
  if (!mimeType.startsWith('image/')) throw new OcrProviderError('UNSUPPORTED_MEDIA');

  let response: Response;
  try {
    response = await fetchImpl(`${VISION_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: bytesToBase64(bytes) },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new OcrProviderError('UPSTREAM_ERROR');
  }
  if (!response.ok) throw new OcrProviderError('UPSTREAM_ERROR');

  let body: VisionResponse;
  try {
    body = (await response.json()) as VisionResponse;
  } catch {
    throw new OcrProviderError('INVALID_RESPONSE');
  }
  const result = body.responses?.[0];
  if (!result || result.error || typeof result.fullTextAnnotation?.text !== 'string') {
    throw new OcrProviderError('INVALID_RESPONSE');
  }
  const extraction = normalize(result.fullTextAnnotation.text);
  const confidence = result.fullTextAnnotation.pages?.[0]?.confidence;
  return { ...extraction, confidence: typeof confidence === 'number' ? confidence : undefined };
}
