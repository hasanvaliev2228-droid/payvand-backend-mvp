import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const migration = readFileSync(
  path.resolve(__dirname, '../supabase/migrations/022_security_rls_final_audit.sql'),
  'utf-8',
);

describe('Final RLS audit hardening', () => {
  it('removes arbitrary self-joining of private conversations', () => {
    expect(migration).toMatch(/drop policy if exists conversation_members_insert_self/);
  });

  it('makes membership and message identity columns immutable', () => {
    expect(migration).toMatch(/guard_conversation_member_update/);
    expect(migration).toMatch(/guard_message_identity_update/);
  });

  it('forces RLS on sensitive user-owned tables', () => {
    for (const table of [
      'transactions',
      'documents',
      'document_scans',
      'budgets',
      'offline_sync_events',
    ]) {
      expect(migration).toContain(`alter table public.${table} force row level security;`);
    }
  });
});
