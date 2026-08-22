import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createCardSchema, updateCardSchema } from '../src/schemas/card.schema';

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      walk(full, files);
    } else if (/\.(ts|sql)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe('Card safety: no full PAN / CVV / raw PIN anywhere in schema or SQL', () => {
  const root = path.resolve(__dirname, '..');
  const scanDirs = ['src', 'supabase'].map((d) => path.join(root, d));
  const files = scanDirs.flatMap((d) => walk(d));

  const forbiddenPatterns = [
    /\bcard_number\b/i,
    /\bfull_pan\b/i,
    /\bcvv\b/i,
    /\bcvc\b/i,
    /\bcard_pin\b/i,
    /\braw_pin\b/i,
    /\braw_otp\b/i,
    /\botp_code\b/i,
  ];

  it('contains no forbidden sensitive-card/PIN/OTP identifiers in any source or SQL file', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(content)) {
          offenders.push(`${file} matched ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('createCardSchema only accepts last4 (never a full card number)', () => {
    const result = createCardSchema.safeParse({
      title: 'Test',
      bank_name: 'Bank',
      last4: '1234',
    });
    expect(result.success).toBe(true);
    // @ts-expect-error - card_number is intentionally not a field on this schema
    expect(createCardSchema.shape.card_number).toBeUndefined();
  });

  it('rejects a last4 value that is not exactly 4 digits', () => {
    expect(createCardSchema.safeParse({ title: 't', bank_name: 'b', last4: '12345' }).success).toBe(
      false,
    );
    expect(createCardSchema.safeParse({ title: 't', bank_name: 'b', last4: 'abcd' }).success).toBe(
      false,
    );
  });

  it('updateCardSchema also has no sensitive fields', () => {
    expect(Object.keys(updateCardSchema.shape)).not.toContain('cvv');
    expect(Object.keys(updateCardSchema.shape)).not.toContain('card_number');
  });
});
