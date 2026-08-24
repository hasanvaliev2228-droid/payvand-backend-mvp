/**
 * OCR + AI document scanner types, sourced from the generated Database
 * types — see notes/notes.types.ts for the same pattern.
 */
import type { Database } from '../../types/database.types';

export type DocumentScanRow = Database['public']['Tables']['document_scans']['Row'];
export type DocumentScanInsert = Database['public']['Tables']['document_scans']['Insert'];
export type DocumentScanUpdate = Database['public']['Tables']['document_scans']['Update'];

/** Normalized structured data an OCR/AI provider extracts from a document image. */
export interface ExtractedDocumentData {
  merchant_name?: string;
  amount?: number;
  currency?: string;
  date?: string; // ISO date, YYYY-MM-DD
  category?: string;
  raw_text?: string;
  confidence?: number; // 0..1
}

/** The pluggable OCR/AI backend contract. See mockOcrProvider in ocr.service.ts. */
export interface OcrProvider {
  readonly name: string;
  extract(imageBytes: Uint8Array, mimeType: string, scanType: ScanType): Promise<ExtractedDocumentData>;
}

export type ScanType = 'receipt' | 'invoice' | 'business_document' | 'personal_document';
export type ScanStatus = 'pending' | 'processing' | 'completed' | 'failed';
