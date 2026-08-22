/**
 * RLS ownership test.
 *
 * This suite runs WITHOUT a live database connection (no Supabase instance
 * is available in this build/CI environment), so instead of exercising RLS
 * against a running Postgres it statically verifies that the RLS policy
 * migration actually implements the ownership rules the spec requires:
 * every user-owned table has RLS enabled, every policy is scoped by an
 * ownership predicate, and a user can never elevate their own role.
 *
 * For a live integration check, see docs/security.md "RLS verification"
 * for the two-JWT cross-read test to run against a real Supabase project.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const rlsSql = readFileSync(
  path.resolve(__dirname, '../supabase/migrations/014_rls_policies.sql'),
  'utf-8',
);

const USER_OWNED_TABLES = [
  'profiles',
  'user_settings',
  'bank_cards',
  'qr_codes',
  'categories',
  'transactions',
  'loans',
  'loan_payments',
  'contacts',
  'conversations',
  'conversation_members',
  'direct_conversation_pairs',
  'messages',
  'message_reactions',
  'documents',
  'calendar_events',
  'health_records',
  'service_providers',
  'notifications',
  'device_tokens',
  'offline_sync_events',
  'audit_logs',
];

describe('RLS ownership (static policy audit)', () => {
  it('enables row level security on every user-owned table', () => {
    for (const table of USER_OWNED_TABLES) {
      expect(rlsSql).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security;`),
      );
    }
  });

  it('scopes owner-keyed tables by an ownership predicate (user_id/owner_id = auth.uid())', () => {
    const ownerKeyed = [
      'user_settings',
      'bank_cards',
      'qr_codes',
      'transactions',
      'loans',
      'contacts',
      'documents',
      'calendar_events',
      'health_records',
      'device_tokens',
      'offline_sync_events',
    ];
    for (const table of ownerKeyed) {
      const tableBlockMatch = rlsSql.match(
        new RegExp(`-- ${table}\\b[\\s\\S]*?(?=-- [a-z_]+\\r?\\n-- ={3,}|$)`),
      );
      expect(tableBlockMatch, `expected a policy block for ${table}`).toBeTruthy();
      expect(tableBlockMatch![0]).toMatch(/(user_id|owner_id)\s*=\s*auth\.uid\(\)/);
    }
  });

  it('prevents a user from escalating their own role to admin', () => {
    expect(rlsSql).toMatch(/profiles_update_own/);
    expect(rlsSql).toMatch(
      /role = \(select role from public\.profiles p where p\.id = auth\.uid\(\)\)/,
    );
  });

  it('restricts chat access to conversation members via is_conversation_member()', () => {
    expect(rlsSql).toMatch(/create or replace function public\.is_conversation_member/);
    expect(rlsSql).toMatch(/conversations_select_member[\s\S]*?is_conversation_member\(id\)/);
    expect(rlsSql).toMatch(
      /messages_select_member[\s\S]*?is_conversation_member\(conversation_id\)/,
    );
  });

  it('gives admin-only mutation rights over service_providers status changes', () => {
    expect(rlsSql).toMatch(/create or replace function public\.is_admin/);
    expect(rlsSql).toMatch(/service_providers_admin_all[\s\S]*?is_admin\(\)/);
  });

  it('grants no direct insert/update/delete policy to regular users on audit_logs', () => {
    const auditBlock = rlsSql.slice(rlsSql.indexOf('-- audit_logs'));
    expect(auditBlock).not.toMatch(/create policy audit_logs_\w*(insert|update|delete)/);
  });
});
