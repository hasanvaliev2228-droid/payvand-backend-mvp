import { z } from 'zod';

export const scanTypeSchema = z.enum(['receipt', 'invoice', 'business_document', 'personal_document']);
export const scanStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);

/** MIME types the OCR pipeline accepts — images plus PDF (a common invoice format). */
export const ALLOWED_SCAN_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const MAX_SCAN_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export const createScanSchema = z.object({
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(ALLOWED_SCAN_MIME_TYPES, {
    errorMap: () => ({ message: 'Навъи файл барои сканкунӣ иҷозат дода намешавад.' }),
  }),
  file_base64: z.string().min(1),
  scan_type: scanTypeSchema,
  document_id: z.string().uuid().optional(),
});
export type CreateScanInput = z.infer<typeof createScanSchema>;

/** Validates the shape of data an OCR/AI provider claims to have extracted, before it's trusted and stored. */
export const extractedDataSchema = z.object({
  merchant_name: z.string().trim().max(200).optional(),
  amount: z.number().min(0).max(1_000_000_000).optional(),
  currency: z.string().trim().length(3).optional(),
  date: z.string().date().optional(),
  category: z.string().trim().max(80).optional(),
  raw_text: z.string().max(50_000).optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type ExtractedDataInput = z.infer<typeof extractedDataSchema>;

export const updateScanSchema = z.object({
  document_id: z.string().uuid().nullable().optional(),
  extracted_merchant_name: z.string().trim().max(200).nullable().optional(),
  extracted_amount: z.number().min(0).max(1_000_000_000).nullable().optional(),
  extracted_currency: z.string().trim().length(3).nullable().optional(),
  extracted_category: z.string().trim().max(80).nullable().optional(),
});
export type UpdateScanInput = z.infer<typeof updateScanSchema>;
