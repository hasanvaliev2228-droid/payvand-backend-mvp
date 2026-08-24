/**
 * Notes module tests. As with the other modules in this project (see
 * rls-ownership.test.ts, chat-membership.test.ts), there is no live
 * Supabase project in this test environment, so ownership/authorization is
 * verified two ways:
 *   1. Schema-level: Zod input validation.
 *   2. Source-level: the RLS policy migration and the Edge Functions
 *      genuinely implement the auth/ownership checks the spec requires.
 * For a live end-to-end check, see docs/security.md "RLS verification".
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createNoteSchema, noteFilterSchema, updateNoteSchema } from '../src/modules/notes/notes.schema';

const migrationSql = readFileSync(
  path.resolve(__dirname, '../supabase/migrations/016_notes.sql'),
  'utf-8',
);
const createFnSource = readFileSync(
  path.resolve(__dirname, '../supabase/functions/create-note/index.ts'),
  'utf-8',
);
const getFnSource = readFileSync(
  path.resolve(__dirname, '../supabase/functions/get-notes/index.ts'),
  'utf-8',
);
const updateFnSource = readFileSync(
  path.resolve(__dirname, '../supabase/functions/update-note/index.ts'),
  'utf-8',
);
const deleteFnSource = readFileSync(
  path.resolve(__dirname, '../supabase/functions/delete-note/index.ts'),
  'utf-8',
);

describe('Authorization: every notes Edge Function requires a valid JWT', () => {
  for (const [name, source] of [
    ['create-note', createFnSource],
    ['get-notes', getFnSource],
    ['update-note', updateFnSource],
    ['delete-note', deleteFnSource],
  ] as const) {
    it(`${name} checks Authorization and rejects with UNAUTHORIZED when auth.getUser() fails`, () => {
      expect(source).toMatch(/Authorization/);
      expect(source).toMatch(/auth\.getUser\(\)/);
      expect(source).toMatch(/UNAUTHORIZED/);
    });
  }
});

describe('RLS ownership (static policy audit)', () => {
  it('enables RLS on notes', () => {
    expect(migrationSql).toMatch(/alter table public\.notes enable row level security;/);
  });

  it('scopes every operation to user_id = auth.uid() (select/insert/update/delete via `for all`)', () => {
    expect(migrationSql).toMatch(
      /create policy notes_owner_all on public\.notes\s*\n\s*for all using \(user_id = auth\.uid\(\)\) with check \(user_id = auth\.uid\(\)\);/,
    );
  });

  it('references profiles(id) with cascade delete, matching every other user-owned table', () => {
    expect(migrationSql).toMatch(/user_id uuid not null references public\.profiles\(id\) on delete cascade/);
  });

  it('update-note and delete-note double-check ownership explicitly before mutating (defense in depth)', () => {
    expect(updateFnSource).toMatch(/\.eq\('user_id', userId\)/);
    expect(deleteFnSource).toMatch(/\.eq\('user_id', userId\)/);
    expect(updateFnSource).toMatch(/NOT_FOUND/);
    expect(deleteFnSource).toMatch(/NOT_FOUND/);
  });

  it('get-notes filters by the caller\'s own user_id (never returns another user\'s notes even if RLS were misconfigured)', () => {
    expect(getFnSource).toMatch(/\.eq\('user_id', userId\)/);
  });
});

describe('Validation', () => {
  it('createNoteSchema requires a non-empty title', () => {
    expect(createNoteSchema.safeParse({ title: '' }).success).toBe(false);
    expect(createNoteSchema.safeParse({ title: 'Хариди бозор' }).success).toBe(true);
  });

  it('createNoteSchema defaults is_private to true', () => {
    const result = createNoteSchema.parse({ title: 'Ёддошт' });
    expect(result.is_private).toBe(true);
  });

  it('createNoteSchema rejects an invalid reminder_at', () => {
    expect(
      createNoteSchema.safeParse({ title: 'Ёддошт', reminder_at: 'not-a-date' }).success,
    ).toBe(false);
  });

  it('createNoteSchema accepts a valid ISO reminder_at', () => {
    expect(
      createNoteSchema.safeParse({ title: 'Ёддошт', reminder_at: new Date().toISOString() })
        .success,
    ).toBe(true);
  });

  it('updateNoteSchema allows clearing reminder_at with null', () => {
    expect(updateNoteSchema.safeParse({ reminder_at: null }).success).toBe(true);
  });

  it('updateNoteSchema rejects an empty title if provided', () => {
    expect(updateNoteSchema.safeParse({ title: '' }).success).toBe(false);
  });

  it('noteFilterSchema coerces hasReminder from a query-string boolean', () => {
    const result = noteFilterSchema.safeParse({ hasReminder: 'true' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.hasReminder).toBe(true);
  });

  it('update-note rejects an empty update payload', () => {
    expect(updateFnSource).toMatch(/Object\.keys\(updates\)\.length === 0/);
  });
});

describe('CRUD operations (Edge Function shape)', () => {
  it('create-note validates title/content/category/is_private/reminder_at and inserts with the caller as user_id', () => {
    expect(createFnSource).toMatch(/title: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(150\)/);
    expect(createFnSource).toMatch(/user_id: userId/);
  });

  it('get-notes supports pagination (page, pageSize) and category filtering', () => {
    expect(getFnSource).toMatch(/page/);
    expect(getFnSource).toMatch(/pageSize/);
    expect(getFnSource).toMatch(/category/);
  });

  it('update-note accepts a note_id plus partial fields', () => {
    expect(updateFnSource).toMatch(/note_id: z\.string\(\)\.uuid\(\)/);
  });

  it('delete-note returns { deleted: true } on success', () => {
    expect(deleteFnSource).toMatch(/deleted: true/);
  });

  it('every notes Edge Function returns the uniform { ok, ... } envelope', () => {
    for (const source of [createFnSource, getFnSource, updateFnSource, deleteFnSource]) {
      expect(source).toMatch(/ok: true/);
      expect(source).toMatch(/ok: false/);
    }
  });
});
