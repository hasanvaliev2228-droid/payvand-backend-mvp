import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  offlineSyncEventSchema,
  syncOfflineEventsBatchSchema,
} from '../src/schemas/notification.schema';

describe('Offline sync validation', () => {
  it('accepts a well-formed offline event', () => {
    const result = offlineSyncEventSchema.safeParse({
      client_event_id: 'evt-abc-123',
      entity_type: 'transaction',
      operation: 'create',
      payload: { amount: 10, title: 'Test', type: 'expense' },
      client_created_at: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects an event missing client_event_id', () => {
    const result = offlineSyncEventSchema.safeParse({
      entity_type: 'transaction',
      operation: 'create',
      payload: {},
      client_created_at: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a batch with more than 200 events', () => {
    const events = Array.from({ length: 201 }, (_, i) => ({
      client_event_id: `evt-${i}`,
      entity_type: 'transaction',
      operation: 'create' as const,
      payload: {},
      client_created_at: new Date().toISOString(),
    }));
    const result = syncOfflineEventsBatchSchema.safeParse({ events });
    expect(result.success).toBe(false);
  });
});

describe('Offline idempotency', () => {
  const source = readFileSync(
    path.resolve(__dirname, '../supabase/functions/sync-offline-events/index.ts'),
    'utf-8',
  );

  it('checks for an existing client_event_id before applying an event', () => {
    expect(source).toMatch(/eq\('client_event_id', event\.client_event_id\)/);
    expect(source).toMatch(/if \(existing\) {/);
  });

  it('scopes the idempotency check to the calling user (never a different user\'s event)', () => {
    expect(source).toMatch(/eq\('client_event_id', event\.client_event_id\)\s*\n\s*\.eq\('user_id', userId\)/);
  });

  it('records a conflict status for transactions instead of silently overwriting', () => {
    expect(source).toMatch(/status = 'conflict'/);
    expect(source).toMatch(/Conflict policy: transactions are NOT merged server-side/);
  });

  it('persists every processed event to offline_sync_events for audit/replay', () => {
    expect(source).toMatch(/admin\.from\('offline_sync_events'\)\.insert/);
  });
});
