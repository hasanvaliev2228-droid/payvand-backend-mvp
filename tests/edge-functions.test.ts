/**
 * Cross-cutting Edge Function conventions: every function must check auth,
 * validate input with Zod, return a uniform response, handle CORS, and the
 * service-role key must never be reachable from client-safe modules.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const FUNCTIONS_DIR = path.resolve(__dirname, '../supabase/functions');
const functionNames = readdirSync(FUNCTIONS_DIR).filter((f) =>
  statSync(path.join(FUNCTIONS_DIR, f)).isDirectory(),
);

describe('Edge Function conventions', () => {
  it('discovers exactly the 10 required Edge Functions', () => {
    expect(functionNames.sort()).toEqual(
      [
        'calculate-loan',
        'create-conversation',
        'create-qr',
        'delete-account',
        'generate-upload-url',
        'mark-conversation-read',
        'send-message',
        'send-notification',
        'sync-offline-events',
        'upload-document',
        'upload-chat-media',
      ].sort(),
    );
  });

  for (const name of functionNames) {
    const source = readFileSync(path.join(FUNCTIONS_DIR, name, 'index.ts'), 'utf-8');

    it(`${name}: handles CORS preflight`, () => {
      expect(source).toMatch(/req\.method === 'OPTIONS'/);
      expect(source).toMatch(/Access-Control-Allow-Origin/);
    });

    it(`${name}: extracts the user from the Authorization header via getUser()`, () => {
      expect(source).toMatch(/Authorization/);
      expect(source).toMatch(/auth\.getUser\(\)/);
    });

    it(`${name}: validates input with a Zod schema`, () => {
      expect(source).toMatch(/from 'npm:zod@/);
      expect(source).toMatch(/safeParse/);
    });

    it(`${name}: returns a uniform { ok, ... } JSON envelope`, () => {
      expect(source).toMatch(/ok: true/);
      expect(source).toMatch(/ok: false/);
    });

    it(`${name}: never returns a raw internal error message to the client`, () => {
      // Catch-all handlers must return a generic message, not err.message.
      expect(source).toMatch(/Хатогии дохилӣ/);
    });
  }

  it('functions that need elevated writes use the service-role client explicitly, scoped to that file only', () => {
    const elevated = [
      'send-notification',
      'generate-upload-url',
      'create-conversation',
      'sync-offline-events',
      'delete-account',
      'upload-document',
    ];
    for (const name of elevated) {
      const source = readFileSync(path.join(FUNCTIONS_DIR, name, 'index.ts'), 'utf-8');
      expect(source).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    }
  });
});

describe('Service-role key isolation (client-safe module graph)', () => {
  const root = path.resolve(__dirname, '..');

  function walk(dir: string, files: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full, files);
      else if (entry.endsWith('.ts')) files.push(full);
    }
    return files;
  }

  it('no module/service file imports supabase-admin.ts', () => {
    const moduleFiles = walk(path.join(root, 'src/modules'));
    const offenders = moduleFiles.filter((f) =>
      readFileSync(f, 'utf-8').includes('supabase-admin'),
    );
    expect(offenders).toEqual([]);
  });

  it('supabase-client.ts (the frontend-safe client) never references the service role key', () => {
    const content = readFileSync(path.join(root, 'src/lib/supabase-client.ts'), 'utf-8');
    expect(content).not.toMatch(/SERVICE_ROLE/);
  });

  it('no hardcoded secret-looking literal appears in src/ (keys are always read from env)', () => {
    const files = walk(path.join(root, 'src'));
    const suspicious =
      /['"]sk_[a-zA-Z0-9]{10,}['"]|['"]ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}['"]/;
    const offenders: string[] = [];
    for (const f of files) {
      if (suspicious.test(readFileSync(f, 'utf-8'))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
