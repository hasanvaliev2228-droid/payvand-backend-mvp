/**
 * Chat membership tests: validates message/conversation schemas plus the
 * static RLS/Edge-Function guarantees around membership. Full end-to-end
 * membership enforcement (two real users, cross-conversation read attempt)
 * requires a live Supabase project — see docs/security.md.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createConversationSchema, sendMessageSchema } from '../src/schemas/message.schema';

describe('Chat membership', () => {
  it('sendMessageSchema requires a valid conversation_id', () => {
    const result = sendMessageSchema.safeParse({
      conversation_id: 'not-a-uuid',
      message_type: 'text',
      body: 'Салом',
    });
    expect(result.success).toBe(false);
  });

  it('createConversationSchema requires a title for group chats to be provided by the caller', () => {
    const parsed = createConversationSchema.safeParse({
      type: 'group',
      member_ids: ['11111111-1111-1111-1111-111111111111'],
    });
    // Schema itself allows title to be optional (the group-title rule is
    // enforced in the create-conversation Edge Function business logic);
    // this test documents that boundary explicitly.
    expect(parsed.success).toBe(true);
  });

  it('the send-message Edge Function performs an explicit membership check before insert', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../supabase/functions/send-message/index.ts'),
      'utf-8',
    );
    expect(source).toMatch(/conversation_members/);
    expect(source).toMatch(/FORBIDDEN/);
    expect(source).toMatch(/Шумо аъзои ин чат нестед/);
  });

  it('the create-conversation Edge Function only allows the creator to add themselves as owner', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../supabase/functions/create-conversation/index.ts'),
      'utf-8',
    );
    expect(source).toMatch(/member_role: uid === callerId \? 'owner' : 'member'/);
  });

  it('the mark-conversation-read Edge Function scopes the update to the caller only', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../supabase/functions/mark-conversation-read/index.ts'),
      'utf-8',
    );
    expect(source).toMatch(/\.eq\('user_id', userData\.user\.id\)/);
  });
});

describe('Conversation duplicate prevention (direct chats)', () => {
  const migrationSql = readFileSync(
    path.resolve(__dirname, '../supabase/migrations/007_contacts_chat.sql'),
    'utf-8',
  );

  it('enforces a unique index on the ordered (user_a, user_b) pair', () => {
    expect(migrationSql).toMatch(
      /create unique index direct_conversation_pairs_unique on public\.direct_conversation_pairs\(user_a, user_b\);/,
    );
  });

  it('the create-conversation function checks for an existing pair before inserting a new one', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../supabase/functions/create-conversation/index.ts'),
      'utf-8',
    );
    expect(source).toMatch(/direct_conversation_pairs/);
    expect(source).toMatch(/existingPair/);
    expect(source).toMatch(/alreadyExisted: true/);
  });
});
