/**
 * Chat media tests: images, voice messages, and files attached to the
 * EXISTING chat system (conversations / conversation_members / messages).
 *
 * As with rls-ownership.test.ts and chat-membership.test.ts, there is no
 * live Supabase project in this test environment, so "authenticated
 * upload blocked/allowed" and "member vs non-member access" are verified
 * two ways:
 *   1. Schema-level: the Zod schemas reject/accept the right shapes.
 *   2. Source-level: the Edge Functions and the migration's storage
 *      policies actually implement the auth/membership/ownership checks
 *      the spec requires (grepped from the real, shipped source — not
 *      re-typed assumptions).
 * For a live end-to-end check (two real users, real JWTs), see
 * docs/security.md "RLS verification".
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_FILE_MIME_TYPES,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VOICE_MIME_TYPES,
  MAX_SIZE_BYTES,
  isAllowedChatMediaMimeType,
  kindForMimeType,
  maxSizeForMimeType,
  uploadChatMediaSchema,
} from '../src/schemas/chat-media.schema';
import { sendMessageSchema } from '../src/schemas/message.schema';

const uploadFnSource = readFileSync(
  path.resolve(__dirname, '../supabase/functions/upload-chat-media/index.ts'),
  'utf-8',
);
const sendMessageFnSource = readFileSync(
  path.resolve(__dirname, '../supabase/functions/send-message/index.ts'),
  'utf-8',
);
const migrationSql = readFileSync(
  path.resolve(__dirname, '../supabase/migrations/015_chat_attachments.sql'),
  'utf-8',
);

describe('Authenticated upload', () => {
  it('upload-chat-media requires a valid Authorization/JWT before doing anything else', () => {
    expect(uploadFnSource).toMatch(/Authorization/);
    expect(uploadFnSource).toMatch(/auth\.getUser\(\)/);
    expect(uploadFnSource).toMatch(/UNAUTHORIZED/);
  });

  it('uploadChatMediaSchema accepts a well-formed image upload request', () => {
    const result = uploadChatMediaSchema.safeParse({
      conversation_id: '11111111-1111-1111-1111-111111111111',
      file_name: 'photo.jpg',
      mime_type: 'image/jpeg',
      file_base64: Buffer.from('fake-image-bytes').toString('base64'),
    });
    expect(result.success).toBe(true);
  });
});

describe('Unauthorized upload blocked', () => {
  it('upload-chat-media returns 401 UNAUTHORIZED before touching Storage when auth.getUser() fails', () => {
    // Structural guarantee: the auth check happens before request-body
    // parsing/validation and before any supabase.storage call.
    const authCheckIndex = uploadFnSource.indexOf('UNAUTHORIZED');
    const storageUploadIndex = uploadFnSource.indexOf('.storage');
    expect(authCheckIndex).toBeGreaterThan(-1);
    expect(storageUploadIndex).toBeGreaterThan(-1);
    expect(authCheckIndex).toBeLessThan(storageUploadIndex);
  });

  it('rejects a disallowed MIME type (e.g. an executable) before upload', () => {
    const result = uploadChatMediaSchema.safeParse({
      conversation_id: '11111111-1111-1111-1111-111111111111',
      file_name: 'virus.exe',
      mime_type: 'application/x-msdownload',
      file_base64: 'AAAA',
    });
    expect(result.success).toBe(false);
  });

  it('enforces per-kind size limits: image 10MB, voice 20MB, file 25MB', () => {
    expect(MAX_SIZE_BYTES.image).toBe(10 * 1024 * 1024);
    expect(MAX_SIZE_BYTES.voice).toBe(20 * 1024 * 1024);
    expect(MAX_SIZE_BYTES.file).toBe(25 * 1024 * 1024);
  });

  it('the Edge Function decodes and checks byte length against the per-kind limit before calling Storage', () => {
    expect(uploadFnSource).toMatch(/MAX_SIZE_BYTES\[kind\]/);
    expect(uploadFnSource).toMatch(/bytes\.length > maxBytes/);
    const sizeCheckIndex = uploadFnSource.indexOf('bytes.length > maxBytes');
    const storageUploadIndex = uploadFnSource.indexOf('.storage');
    expect(sizeCheckIndex).toBeLessThan(storageUploadIndex);
  });
});

describe('MIME allow-lists match the spec exactly', () => {
  it('images: jpeg, png, webp', () => {
    expect([...ALLOWED_IMAGE_MIME_TYPES].sort()).toEqual(
      ['image/jpeg', 'image/png', 'image/webp'].sort(),
    );
  });

  it('voice: mpeg, mp4, wav', () => {
    expect([...ALLOWED_VOICE_MIME_TYPES].sort()).toEqual(
      ['audio/mpeg', 'audio/mp4', 'audio/wav'].sort(),
    );
  });

  it('files: pdf, doc, docx', () => {
    expect([...ALLOWED_FILE_MIME_TYPES].sort()).toEqual(
      [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ].sort(),
    );
  });

  it('kindForMimeType / isAllowedChatMediaMimeType / maxSizeForMimeType agree with each other', () => {
    expect(kindForMimeType('image/png')).toBe('image');
    expect(kindForMimeType('audio/wav')).toBe('voice');
    expect(kindForMimeType('application/pdf')).toBe('file');
    expect(kindForMimeType('application/zip')).toBeUndefined();

    expect(isAllowedChatMediaMimeType('image/webp')).toBe(true);
    expect(isAllowedChatMediaMimeType('video/mp4')).toBe(false);

    expect(maxSizeForMimeType('image/jpeg')).toBe(MAX_SIZE_BYTES.image);
    expect(maxSizeForMimeType('audio/mpeg')).toBe(MAX_SIZE_BYTES.voice);
    expect(maxSizeForMimeType('application/pdf')).toBe(MAX_SIZE_BYTES.file);
  });
});

describe('Conversation membership required to upload', () => {
  it('upload-chat-media checks conversation_members before accepting the upload', () => {
    expect(uploadFnSource).toMatch(/conversation_members/);
    expect(uploadFnSource).toMatch(/FORBIDDEN/);
    expect(uploadFnSource).toMatch(/Шумо аъзои ин чат нестед/);
    const membershipCheckIndex = uploadFnSource.indexOf('conversation_members');
    const storageUploadIndex = uploadFnSource.indexOf('.storage');
    expect(membershipCheckIndex).toBeLessThan(storageUploadIndex);
  });
});

describe('Conversation member can access media / non-member cannot', () => {
  it('the migration adds an is_chat_media_conversation_member() helper used by the SELECT policy', () => {
    expect(migrationSql).toMatch(/create or replace function public\.is_chat_media_conversation_member/);
    expect(migrationSql).toMatch(
      /chat_media_select_owner_or_conversation_member[\s\S]*?is_chat_media_conversation_member\(name\)/,
    );
  });

  it('the membership helper joins conversation_members on the message that owns the object, scoped to auth.uid()', () => {
    const fnBody = migrationSql.slice(
      migrationSql.indexOf('is_chat_media_conversation_member(object_name text)'),
    );
    expect(fnBody).toMatch(/join public\.conversation_members cm on cm\.conversation_id = m\.conversation_id/);
    expect(fnBody).toMatch(/cm\.user_id = auth\.uid\(\)/);
    expect(fnBody).toMatch(/m\.file_url = object_name/);
  });

  it('a user can always read their OWN uploaded objects regardless of conversation', () => {
    expect(migrationSql).toMatch(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  });

  it('insert/update/delete on chat-media are owner-only (never granted to other conversation members)', () => {
    expect(migrationSql).toMatch(/chat_media_insert_own[\s\S]*?for insert[\s\S]*?auth\.uid\(\)::text/);
    expect(migrationSql).toMatch(/chat_media_update_own[\s\S]*?for update/);
    expect(migrationSql).toMatch(/chat_media_delete_own[\s\S]*?for delete/);
  });

  it('a non-member has no path to true in the SELECT policy (owner check fails, and the helper query finds no matching conversation_members row)', () => {
    // Static guarantee: the OR is exactly two branches — owner-by-path or
    // conversation-membership-by-message — no third, broader branch exists.
    const policyBlock = migrationSql.slice(
      migrationSql.indexOf('chat_media_select_owner_or_conversation_member'),
      migrationSql.indexOf('chat_media_insert_own'),
    );
    const orCount = (policyBlock.match(/\bor\b/g) ?? []).length;
    expect(orCount).toBe(1);
  });
});

describe('Text message still works', () => {
  it('sendMessageSchema still accepts a plain text message with no attachment fields', () => {
    const result = sendMessageSchema.safeParse({
      conversation_id: '11111111-1111-1111-1111-111111111111',
      message_type: 'text',
      body: 'Салом, чӣ хел ҳастӣ?',
    });
    expect(result.success).toBe(true);
  });

  it('still rejects a text message with no body (unchanged behavior)', () => {
    const result = sendMessageSchema.safeParse({
      conversation_id: '11111111-1111-1111-1111-111111111111',
      message_type: 'text',
    });
    expect(result.success).toBe(false);
  });

  it('the migration keeps the legacy file_path column and the legacy "audio" message_type value', () => {
    expect(migrationSql).toMatch(/-- The legacy `file_path` column/);
    expect(migrationSql).toMatch(/'text', 'image', 'voice', 'file', 'audio', 'system'/);
  });
});

describe('Image message works', () => {
  it('sendMessageSchema accepts an image message with file_url', () => {
    const result = sendMessageSchema.safeParse({
      conversation_id: '11111111-1111-1111-1111-111111111111',
      message_type: 'image',
      file_url: 'user-123/images/abc.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('sendMessageSchema still accepts the legacy image shape (file_path only)', () => {
    const result = sendMessageSchema.safeParse({
      conversation_id: '11111111-1111-1111-1111-111111111111',
      message_type: 'image',
      file_path: 'user-123/generic/abc.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an image message with neither file_url nor file_path', () => {
    const result = sendMessageSchema.safeParse({
      conversation_id: '11111111-1111-1111-1111-111111111111',
      message_type: 'image',
    });
    expect(result.success).toBe(false);
  });

  it('send-message rejects a file_url that does not belong to the sender', () => {
    expect(sendMessageFnSource).toMatch(/file_url\.startsWith\(`\$\{senderId\}\/`\)/);
    expect(sendMessageFnSource).toMatch(/Файли замимашуда ба шумо тааллуқ надорад/);
  });
});

describe('Voice message works', () => {
  it('sendMessageSchema accepts a voice message with file_url and voice_duration_seconds', () => {
    const result = sendMessageSchema.safeParse({
      conversation_id: '11111111-1111-1111-1111-111111111111',
      message_type: 'voice',
      file_url: 'user-123/voice/abc.m4a',
      voice_duration_seconds: 15,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a voice message missing voice_duration_seconds', () => {
    const result = sendMessageSchema.safeParse({
      conversation_id: '11111111-1111-1111-1111-111111111111',
      message_type: 'voice',
      file_url: 'user-123/voice/abc.m4a',
    });
    expect(result.success).toBe(false);
  });

  it('the migration adds voice_duration_seconds as a positive-or-null integer column', () => {
    expect(migrationSql).toMatch(
      /voice_duration_seconds integer check \(\s*voice_duration_seconds is null or voice_duration_seconds > 0\s*\)/,
    );
  });
});

describe('File message works', () => {
  it('sendMessageSchema accepts a file message with file_url and file_name', () => {
    const result = sendMessageSchema.safeParse({
      conversation_id: '11111111-1111-1111-1111-111111111111',
      message_type: 'file',
      file_url: 'user-123/files/abc.pdf',
      file_name: 'document.pdf',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a file message missing file_name (and no legacy file_path to fall back on)', () => {
    const result = sendMessageSchema.safeParse({
      conversation_id: '11111111-1111-1111-1111-111111111111',
      message_type: 'file',
      file_url: 'user-123/files/abc.pdf',
    });
    expect(result.success).toBe(false);
  });
});

describe('New columns and indexes exist on messages', () => {
  it('adds file_url, file_name, file_size, mime_type, voice_duration_seconds', () => {
    for (const col of ['file_url', 'file_name', 'file_size', 'mime_type', 'voice_duration_seconds']) {
      expect(migrationSql).toMatch(new RegExp(`add column if not exists ${col}`));
    }
  });

  it('adds conversation_id and created_at indexes (sender_id was already indexed pre-existing)', () => {
    expect(migrationSql).toMatch(/create index if not exists messages_conversation_id_plain_idx on public\.messages\(conversation_id\)/);
    expect(migrationSql).toMatch(/create index if not exists messages_created_at_idx on public\.messages\(created_at desc\)/);
  });
});
