/**
 * OCR + AI document scanner module.
 *
 * Security note: RLS (document_scans_owner_all, 019_document_scans.sql)
 * scopes every row to user_id. The OCR/AI provider's API key
 * (OCR_API_KEY, src/config/env.ts) is read server-side only via getEnv()
 * and is NEVER included in any value returned by this module or by
 * scan-document/index.ts — only the EXTRACTED structured data (merchant,
 * amount, date, ...) ever crosses back to the client.
 *
 * Workflow this module supports (see supabase/functions/scan-document for
 * the full upload → OCR → save pipeline):
 *   1. Client uploads image/PDF bytes.
 *   2. getOcrProvider().extract() turns bytes into ExtractedDocumentData.
 *   3. extractedDataSchema validates the provider's output before trusting it
 *      (a misbehaving or compromised provider can't inject arbitrary fields).
 *   4. createScan() persists the result as a document_scans row.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import {
  deleteRowById,
  getRowById,
  insertRow,
  listRows,
  updateRowById,
} from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import { AppError } from '../../lib/errors';
import { getEnv } from '../../config/env';
import { extractedDataSchema, updateScanSchema, type UpdateScanInput } from './ocr.schema';
import type {
  DocumentScanRow,
  ExtractedDocumentData,
  OcrProvider,
  ScanType,
} from './ocr.types';
import type { ListResult } from '../../types/api.types';

// ---------------------------------------------------------------------------
// OCR/AI provider adapters
// ---------------------------------------------------------------------------

/**
 * Mock provider: used whenever OCR_API_KEY isn't configured (default in
 * every environment until a real key is provisioned — mirrors the mock
 * push-notification adapter in send-notification/index.ts). Returns a
 * clearly-labeled, low-confidence placeholder result rather than fabricating
 * a confident-looking fake extraction.
 */
export const mockOcrProvider: OcrProvider = {
  name: 'mock',
  async extract(_imageBytes, _mimeType, _scanType): Promise<ExtractedDocumentData> {
    return {
      raw_text: '[mock OCR — no OCR_API_KEY configured; configure one to enable real extraction]',
      confidence: 0,
    };
  },
};

/**
 * Real provider extension point. Deliberately NOT wired to a live network
 * call in this codebase (no outbound network access from this build
 * environment, and doing so would require committing to one specific
 * vendor's request/response shape). To activate: implement `extract()`
 * using `fetch()` against your chosen OCR/AI vendor, authenticated with
 * `getEnv().OCR_API_KEY` — never hardcode the key, and never return it (or
 * any other secret) as part of ExtractedDocumentData.
 */
function buildRealOcrProvider(providerName: 'openai' | 'google_vision', _apiKey: string): OcrProvider {
  return {
    name: providerName,
    async extract(): Promise<ExtractedDocumentData> {
      throw AppError.internal(
        `OCR provider "${providerName}" is configured but not yet implemented. ` +
          'Implement extract() in ocr.service.ts using getEnv().OCR_API_KEY, or set OCR_PROVIDER=mock.',
      );
    },
  };
}

export function getOcrProvider(): OcrProvider {
  const env = getEnv();
  if (env.OCR_PROVIDER === 'mock' || !env.OCR_API_KEY) return mockOcrProvider;
  return buildRealOcrProvider(env.OCR_PROVIDER, env.OCR_API_KEY);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listMyScans(
  client: SupabaseClient<Database>,
  userId: string,
  options: Omit<ListOptions, 'filters'> & { scan_type?: ScanType; status?: string },
): Promise<ListResult<DocumentScanRow>> {
  const { scan_type, status, ...rest } = options;
  return listRows<DocumentScanRow>(client, 'document_scans', {
    ...rest,
    filters: { user_id: userId, scan_type, status },
  });
}

export async function getMyScan(client: SupabaseClient<Database>, id: string): Promise<DocumentScanRow> {
  return getRowById<DocumentScanRow>(client, 'document_scans', id);
}

/**
 * Persists a scan result. `extracted` is validated with extractedDataSchema
 * before any of it is trusted and written to the row — this is the
 * boundary between "whatever the OCR/AI provider returned" and "what we
 * actually store".
 */
export async function saveScanResult(
  client: SupabaseClient<Database>,
  params: {
    userId: string;
    filePath: string;
    scanType: ScanType;
    provider: string;
    status: 'completed' | 'failed';
    extracted?: ExtractedDocumentData;
    errorMessage?: string;
    documentId?: string;
  },
): Promise<DocumentScanRow> {
  const validatedExtraction = params.extracted ? parseOrThrow(extractedDataSchema, params.extracted) : undefined;

  return insertRow<DocumentScanRow>(client, 'document_scans', {
    user_id: params.userId,
    file_path: params.filePath,
    scan_type: params.scanType,
    provider: params.provider,
    status: params.status,
    document_id: params.documentId,
    extracted_merchant_name: validatedExtraction?.merchant_name,
    extracted_amount: validatedExtraction?.amount,
    extracted_currency: validatedExtraction?.currency,
    extracted_date: validatedExtraction?.date,
    extracted_category: validatedExtraction?.category,
    raw_text: validatedExtraction?.raw_text,
    confidence: validatedExtraction?.confidence,
    error_message: params.errorMessage,
  });
}

export async function updateScan(
  client: SupabaseClient<Database>,
  id: string,
  input: UpdateScanInput,
): Promise<DocumentScanRow> {
  const values = parseOrThrow(updateScanSchema, input);
  return updateRowById<DocumentScanRow>(client, 'document_scans', id, values);
}

export async function deleteScan(client: SupabaseClient<Database>, id: string): Promise<void> {
  return deleteRowById(client, 'document_scans', id);
}
