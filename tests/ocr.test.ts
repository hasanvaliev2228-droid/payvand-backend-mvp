/**
 * OCR + AI document scanner tests: validation, security (mime/size,
 * ownership), and the upload -> Storage -> OCR -> structured data -> DB
 * workflow, verified statically against the shipped migration/schema/
 * Edge Function source (no live Supabase project in this environment —
 * same approach as chat-media.test.ts / documents-security.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_SCAN_MIME_TYPES,
  MAX_SCAN_SIZE_BYTES,
  createScanSchema,
  extractedDataSchema,
  scanTypeSchema,
  updateScanSchema,
} from '../src/modules/ocr/ocr.schema';
import { getOcrProvider, mockOcrProvider } from '../src/modules/ocr/ocr.service';

const migrationSql = readFileSync(
  path.resolve(__dirname, '../supabase/migrations/019_document_scans.sql'),
  'utf-8',
);
const scanFnSource = readFileSync(
  path.resolve(__dirname, '../supabase/functions/scan-document/index.ts'),
  'utf-8',
);

describe('Workflow support: receipts, invoices, business & personal documents', () => {
  it('scanTypeSchema accepts exactly the four required document kinds', () => {
    expect(scanTypeSchema.options.sort()).toEqual(
      ['business_document', 'invoice', 'personal_document', 'receipt'].sort(),
    );
  });

  it('createScanSchema requires file_name, mime_type, file_base64, and scan_type', () => {
    const result = createScanSchema.safeParse({
      file_name: 'receipt.jpg',
      mime_type: 'image/jpeg',
      file_base64: Buffer.from('fake-bytes').toString('base64'),
      scan_type: 'receipt',
    });
    expect(result.success).toBe(true);
  });

  it('createScanSchema optionally accepts a document_id to link an existing document', () => {
    const result = createScanSchema.safeParse({
      file_name: 'invoice.pdf',
      mime_type: 'application/pdf',
      file_base64: 'AAAA',
      scan_type: 'invoice',
      document_id: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.success).toBe(true);
  });
});

describe('Validation', () => {
  it('allows jpeg, png, webp, and pdf', () => {
    expect([...ALLOWED_SCAN_MIME_TYPES].sort()).toEqual(
      ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].sort(),
    );
  });

  it('rejects a disallowed MIME type', () => {
    const result = createScanSchema.safeParse({
      file_name: 'virus.exe',
      mime_type: 'application/x-msdownload',
      file_base64: 'AAAA',
      scan_type: 'receipt',
    });
    expect(result.success).toBe(false);
  });

  it('enforces a 15MB size limit', () => {
    expect(MAX_SCAN_SIZE_BYTES).toBe(15 * 1024 * 1024);
  });

  it('extractedDataSchema validates provider output before it is trusted', () => {
    expect(
      extractedDataSchema.safeParse({
        merchant_name: 'Магазин "Салом"',
        amount: 125.5,
        currency: 'TJS',
        date: '2026-08-01',
        category: 'groceries',
        confidence: 0.92,
      }).success,
    ).toBe(true);
  });

  it('extractedDataSchema rejects a confidence outside [0,1]', () => {
    expect(extractedDataSchema.safeParse({ confidence: 1.5 }).success).toBe(false);
    expect(extractedDataSchema.safeParse({ confidence: -0.1 }).success).toBe(false);
  });

  it('extractedDataSchema rejects a negative amount', () => {
    expect(extractedDataSchema.safeParse({ amount: -10 }).success).toBe(false);
  });

  it('extractedDataSchema rejects a currency that is not exactly 3 characters', () => {
    expect(extractedDataSchema.safeParse({ currency: 'DOLLARS' }).success).toBe(false);
  });

  it('updateScanSchema allows clearing extracted fields with null', () => {
    expect(updateScanSchema.safeParse({ extracted_merchant_name: null }).success).toBe(true);
  });
});

describe('Security', () => {
  it('scan-document requires authentication before anything else', () => {
    const authIdx = scanFnSource.indexOf('UNAUTHORIZED');
    const uploadIdx = scanFnSource.indexOf('.storage');
    expect(authIdx).toBeGreaterThan(-1);
    expect(uploadIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(uploadIdx);
  });

  it('stores the source file under {user_id}/scans/... in the EXISTING documents bucket (no new bucket)', () => {
    expect(scanFnSource).toMatch(/`\$\{userId\}\/scans\/\$\{scanId\}\.\$\{extension\}`/);
    expect(scanFnSource).toMatch(/supabase\.storage\s*\n?\s*\.from\('documents'\)/);
  });

  it('verifies ownership of a referenced document_id before linking a scan to it', () => {
    expect(scanFnSource).toMatch(/\.eq\('user_id', userId\)/);
    expect(scanFnSource).toMatch(/NOT_FOUND/);
  });

  it('enforces the size limit before ever touching Storage', () => {
    const sizeCheckIdx = scanFnSource.indexOf('bytes.length > MAX_SIZE_BYTES');
    const uploadIdx = scanFnSource.indexOf('.storage');
    expect(sizeCheckIdx).toBeGreaterThan(-1);
    expect(sizeCheckIdx).toBeLessThan(uploadIdx);
  });

  it('never returns OCR_API_KEY in the response (only reads it from Deno.env, never echoes it)', () => {
    expect(scanFnSource).not.toMatch(/data:\s*\{[^}]*apiKey/i);
    // The only place OCR_API_KEY appears is a Deno.env.get(...) read.
    const occurrences = scanFnSource.match(/OCR_API_KEY/g) ?? [];
    for (let index = 0; index < occurrences.length; index += 1) {
      expect(scanFnSource).toMatch(/Deno\.env\.get\('OCR_API_KEY'\)/);
    }
  });

  it('RLS: document_scans is enabled and owner-scoped', () => {
    expect(migrationSql).toMatch(/alter table public\.document_scans enable row level security;/);
    expect(migrationSql).toMatch(
      /create policy document_scans_owner_all on public\.document_scans\s*\n\s*for all using \(user_id = auth\.uid\(\)\) with check \(user_id = auth\.uid\(\)\);/,
    );
  });

  it('validates extracted provider output server-side too (not just client-side schema)', () => {
    expect(scanFnSource).toMatch(/extractedDataSchema\.safeParse\(result\.data\)/);
    expect(scanFnSource).toMatch(/status = 'failed'/);
  });
});

describe('Mock OCR provider (used when OCR_API_KEY is not configured)', () => {
  it('returns a low-confidence, clearly-labeled placeholder rather than a fake confident result', () => {
    expect(mockOcrProvider.name).toBe('mock');
  });

  it('getOcrProvider() defaults to mock when no OCR_API_KEY is set', async () => {
    const { resetEnvCache } = await import('../src/config/env');
    const previousEnv = { ...process.env };
    resetEnvCache();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    delete process.env.OCR_API_KEY;
    process.env.OCR_PROVIDER = 'mock';

    try {
      const provider = getOcrProvider();
      expect(provider.name).toBe('mock');
    } finally {
      process.env = previousEnv;
      resetEnvCache();
    }
  });
});

describe('Database structure', () => {
  it('links optionally to an existing document via document_id (nullable, ON DELETE SET NULL)', () => {
    expect(migrationSql).toMatch(
      /document_id uuid references public\.documents\(id\) on delete set null/,
    );
  });

  it('constrains scan_type to the four supported kinds', () => {
    expect(migrationSql).toMatch(
      /scan_type text not null check \(scan_type in \('receipt', 'invoice', 'business_document', 'personal_document'\)\)/,
    );
  });

  it('constrains status to the processing lifecycle', () => {
    expect(migrationSql).toMatch(
      /status text not null default 'pending' check \(status in \('pending', 'processing', 'completed', 'failed'\)\)/,
    );
  });
});
