import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createDocumentSchema,
  documentMimeTypeSchema,
  generateUploadUrlSchema,
} from '../src/schemas/document.schema';
import { buildStoragePath, sanitizeFilename } from '../src/lib/security';

describe('Document MIME validation', () => {
  it('accepts every explicitly allowed document MIME type', () => {
    for (const mime of [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]) {
      expect(documentMimeTypeSchema.safeParse(mime).success).toBe(true);
    }
  });

  it('rejects a disallowed MIME type (e.g. executable)', () => {
    expect(documentMimeTypeSchema.safeParse('application/x-msdownload').success).toBe(false);
  });

  it('createDocumentSchema rejects an unsupported mime_type', () => {
    const result = createDocumentSchema.safeParse({
      title: 'Ҳуҷҷат',
      original_filename: 'test.exe',
      mime_type: 'application/x-msdownload',
      file_size: 1000,
    });
    expect(result.success).toBe(false);
  });
});

describe('Document maximum file size validation', () => {
  it('rejects a non-positive file_size', () => {
    expect(
      createDocumentSchema.safeParse({
        title: 'Ҳуҷҷат',
        original_filename: 'a.pdf',
        mime_type: 'application/pdf',
        file_size: 0,
      }).success,
    ).toBe(false);
  });

  it('the generate-upload-url Edge Function enforces STORAGE_MAX_FILE_SIZE_MB', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../supabase/functions/generate-upload-url/index.ts'),
      'utf-8',
    );
    expect(source).toMatch(/STORAGE_MAX_FILE_SIZE_MB/);
    expect(source).toMatch(/file_size > maxSizeMb \* 1024 \* 1024/);
  });

  it('the upload-document Edge Function re-validates size server-side', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../supabase/functions/upload-document/index.ts'),
      'utf-8',
    );
    expect(source).toMatch(/STORAGE_MAX_FILE_SIZE_MB/);
  });
});

describe('Signed upload URL validation', () => {
  it('generateUploadUrlSchema requires bucket, mime_type, file_size and extension', () => {
    const result = generateUploadUrlSchema.safeParse({
      bucket: 'documents',
      mime_type: 'application/pdf',
      file_size: 1024,
      extension: 'pdf',
    });
    expect(result.success).toBe(true);
  });

  it('generateUploadUrlSchema rejects an unknown bucket', () => {
    const result = generateUploadUrlSchema.safeParse({
      bucket: 'not-a-real-bucket',
      mime_type: 'application/pdf',
      file_size: 1024,
      extension: 'pdf',
    });
    expect(result.success).toBe(false);
  });

  it('the generate-upload-url function rejects a MIME type not allowed for the requested bucket', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../supabase/functions/generate-upload-url/index.ts'),
      'utf-8',
    );
    expect(source).toMatch(/MIME_BY_BUCKET/);
    expect(source).toMatch(/allowedMimes\.includes\(mime_type\)/);
  });

  it('the upload-document function rejects a file_path outside the caller\'s own user_id prefix', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../supabase/functions/upload-document/index.ts'),
      'utf-8',
    );
    expect(source).toMatch(/file_path\.startsWith\(`\$\{userId\}\/`\)/);
  });
});

describe('Storage path safety helpers', () => {
  it('buildStoragePath always starts with {user_id}/', () => {
    const p = buildStoragePath('user-123', 'resource-456', 'PDF');
    expect(p.startsWith('user-123/resource-456/')).toBe(true);
    expect(p.endsWith('.pdf')).toBe(true);
  });

  it('sanitizeFilename strips path separators and control characters', () => {
    expect(sanitizeFilename('../../etc/passwd')).not.toMatch(/\.\.\//);
    expect(sanitizeFilename('a\\b/c.txt')).toBe('a_b_c.txt');
  });
});
