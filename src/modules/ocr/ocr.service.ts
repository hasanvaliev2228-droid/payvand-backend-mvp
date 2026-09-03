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
import {
  extractedDataSchema,
  updateScanSchema,
  type UpdateScanInput,
} from './ocr.schema';
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
 * Controlled fallback for callers without a configured OCR provider.
 *
 * IMPORTANT:
 * This provider NEVER returns fabricated OCR data.
 * Callers receive a controlled configuration error instead.
 *
 * The production Edge Function (`scan-document`) has its own Google Vision
 * adapter and records a controlled `not_configured` failure when no
 * production OCR provider is configured.
 */
export const unavailableOcrProvider: OcrProvider = {
  name: 'not_configured',

  async extract(): Promise<ExtractedDocumentData> {
    throw AppError.internal('OCR provider is not configured.');
  },
};

/**
 * Real provider extension point.
 *
 * The production `scan-document` Edge Function currently owns the live
 * Google Vision adapter. This in-process service intentionally does not
 * manufacture OCR data when a provider is unavailable.
 *
 * To activate another provider here, implement `extract()` using the
 * provider's API and authenticate with the server-side OCR_API_KEY.
 * Never hardcode or return the provider API key.
 */
function buildRealOcrProvider(
  providerName: 'openai' | 'google_vision',
  _apiKey: string,
): OcrProvider {
  return {
    name: providerName,

    async extract(): Promise<ExtractedDocumentData> {
      throw AppError.internal(
        `OCR provider "${providerName}" is configured but not yet implemented.`,
      );
    },
  };
}

export function getOcrProvider(): OcrProvider {
  const env = getEnv();

  if (env.OCR_PROVIDER === 'disabled' || !env.OCR_API_KEY) {
    return unavailableOcrProvider;
  }

  return buildRealOcrProvider(env.OCR_PROVIDER, env.OCR_API_KEY);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listMyScans(
  client: SupabaseClient<Database>,
  userId: string,
  options: Omit<ListOptions, 'filters'> & {
    scan_type?: ScanType;
    status?: string;
  },
): Promise<ListResult<DocumentScanRow>> {
  const { scan_type, status, ...rest } = options;

  return listRows<DocumentScanRow>(client, 'document_scans', {
    ...rest,
    filters: {
      user_id: userId,
      scan_type,
      status,
    },
  });
}

export async function getMyScan(
  client: SupabaseClient<Database>,
  id: string,
): Promise<DocumentScanRow> {
  return getRowById<DocumentScanRow>(client, 'document_scans', id);
}

/**
 * Persists a scan result.
 *
 * `extracted` is validated with extractedDataSchema before any of it is
 * trusted and written to the row. This is the boundary between
 * "whatever the OCR/AI provider returned" and "what we actually store".
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
  const validatedExtraction = params.extracted
    ? parseOrThrow(extractedDataSchema, params.extracted)
    : undefined;

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

  return updateRowById<DocumentScanRow>(
    client,
    'document_scans',
    id,
    values,
  );
}

export async function deleteScan(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  return deleteRowById(client, 'document_scans', id);
}