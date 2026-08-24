/**
 * Chat module: conversations, members, messages, reactions.
 *
 * Security note:
 * - Membership is the sole access boundary; every read/write here still runs
 *   through the caller's RLS-scoped client, so is_conversation_member()
 *   (see 014_rls_policies.sql) is the real enforcement point, not this code.
 * - Adding OTHER users as members, and creating conversations without
 *   duplicate direct threads, requires elevated logic that runs in the
 *   create-conversation Edge Function under the service role (a plain user
 *   can only insert themselves per conversation_members_insert_self).
 * - Read receipts: last_read_at can only be changed by the member themself.
 * - Messages are soft-deleted (deleted_at set), never hard-deleted, to
 *   preserve conversation history/integrity for other members.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import { insertRow, listRows } from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import {
  addReactionSchema,
  editMessageSchema,
  markReadSchema,
  sendMessageSchema,
  type AddReactionInput,
  type EditMessageInput,
  type MarkReadInput,
  type SendMessageInput,
} from '../../schemas/message.schema';
import type { ListResult } from '../../types/api.types';
import { AppError } from '../../lib/errors';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '../i18n/i18n.service';

type ConversationRow = Database['public']['Tables']['conversations']['Row'];
type MessageRow = Database['public']['Tables']['messages']['Row'];
type ReactionRow = Database['public']['Tables']['message_reactions']['Row'];

export async function listMyConversations(
  client: SupabaseClient<Database>,
  options: Omit<ListOptions, 'filters'>,
): Promise<ListResult<ConversationRow>> {
  // RLS (conversations_select_member) already restricts to conversations the
  // caller belongs to, so no explicit filter is required (or possible,
  // since membership isn't a column on `conversations`).
  return listRows<ConversationRow>(client, 'conversations', options);
}

export async function listMessages(
  client: SupabaseClient<Database>,
  conversationId: string,
  options: Omit<ListOptions, 'filters'>,
): Promise<ListResult<MessageRow>> {
  return listRows<MessageRow>(client, 'messages', {
    ...options,
    filters: { conversation_id: conversationId },
  });
}

export async function sendMessage(
  client: SupabaseClient<Database>,
  senderId: string,
  input: SendMessageInput,
): Promise<MessageRow> {
  const values = parseOrThrow(sendMessageSchema, input);
  return insertRow<MessageRow>(client, 'messages', { ...values, sender_id: senderId });
}

export async function editMessage(
  client: SupabaseClient<Database>,
  input: EditMessageInput,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): Promise<MessageRow> {
  const values = parseOrThrow(editMessageSchema, input);
  const { data, error } = await client
    .from('messages')
    .update({ body: values.body, edited_at: new Date().toISOString() })
    .eq('id', values.message_id)
    .select('*')
    .maybeSingle();
  if (error) throw AppError.internal(error.message);
  if (!data) throw AppError.translated('NOT_FOUND', lang, 'chat.message_not_found');
  return data;
}

/** Soft delete: sets deleted_at and clears body, never removes the row. */
export async function deleteMessage(
  client: SupabaseClient<Database>,
  messageId: string,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): Promise<MessageRow> {
  const { data, error } = await client
    .from('messages')
    .update({ deleted_at: new Date().toISOString(), body: null })
    .eq('id', messageId)
    .select('*')
    .maybeSingle();
  if (error) throw AppError.internal(error.message);
  if (!data) throw AppError.translated('NOT_FOUND', lang, 'chat.message_not_found');
  return data;
}

export async function addReaction(
  client: SupabaseClient<Database>,
  userId: string,
  input: AddReactionInput,
): Promise<ReactionRow> {
  const values = parseOrThrow(addReactionSchema, input);
  return insertRow<ReactionRow>(client, 'message_reactions', { ...values, user_id: userId });
}

export async function removeReaction(
  client: SupabaseClient<Database>,
  reactionId: string,
): Promise<void> {
  const { error } = await client.from('message_reactions').delete().eq('id', reactionId);
  if (error) throw AppError.internal(error.message);
}

export async function markConversationRead(
  client: SupabaseClient<Database>,
  userId: string,
  input: MarkReadInput,
): Promise<void> {
  const values = parseOrThrow(markReadSchema, input);
  const { error } = await client
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', values.conversation_id)
    .eq('user_id', userId);
  if (error) throw AppError.internal(error.message);
}

/**
 * Realtime subscription example (frontend):
 *
 *   const channel = supabase
 *     .channel(`conversation:${conversationId}`) // scoped, unguessable-enough channel name
 *     .on('postgres_changes',
 *       { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
 *       (payload) => onNewMessage(payload.new))
 *     .subscribe();
 *
 * Realtime authorization note: Supabase Realtime evaluates the same RLS
 * policies as REST/PostgREST for postgres_changes, so a client can only
 * receive INSERT/UPDATE events for messages in conversations they are a
 * member of — the channel name itself grants no extra access.
 */
