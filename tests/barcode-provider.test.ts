import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const functionSource = readFileSync(
  path.resolve(__dirname, '../supabase/functions/barcode-lookup/index.ts'),
  'utf-8',
);
const providerSource = readFileSync(
  path.resolve(__dirname, '../supabase/functions/barcode-lookup/open-food-facts.provider.ts'),
  'utf-8',
);

describe('Barcode provider boundary', () => {
  it('requires a user session and validates supported barcode lengths', () => {
    expect(functionSource).toMatch(/auth\.getUser\(\)/);
    expect(functionSource).toMatch(/\\d\{8,14\}/);
  });

  it('is disabled by default rather than returning invented products', () => {
    expect(functionSource).toMatch(/BARCODE_PROVIDER/);
    expect(functionSource).toMatch(/PROVIDER_NOT_CONFIGURED/);
    expect(providerSource).toMatch(/NOT_FOUND/);
  });

  it('rate-limits upstream calls and uses a timeout', () => {
    expect(functionSource).toMatch(/consume_rate_limit/);
    expect(providerSource).toMatch(/AbortSignal\.timeout\(8_000\)/);
  });
});
