/**
 * Bank cards module — DISPLAY/RECORD-KEEPING ONLY.
 *
 * Security note: schema-level, only `last4` (regex ^\d{4}$) is accepted.
 * There is no field anywhere in createCardSchema/updateCardSchema for a full
 * card number, verification data, expiry date, or card PIN, so the ORM layer cannot pass
 * them through even if a malicious client tries. RLS (bank_cards_owner_all)
 * additionally guarantees a user can only ever see/edit their own cards.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import {
  deleteRowById,
  getRowById,
  insertRow,
  listRows,
  updateRowById,
} from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import {
  createCardSchema,
  updateCardSchema,
  type CreateCardInput,
  type UpdateCardInput,
} from '../../schemas/card.schema';
import type { ListResult } from '../../types/api.types';

type CardRow = Database['public']['Tables']['bank_cards']['Row'];

export async function listMyCards(
  client: SupabaseClient<Database>,
  userId: string,
  options: Omit<ListOptions, 'filters'>,
): Promise<ListResult<CardRow>> {
  return listRows<CardRow>(client, 'bank_cards', {
    ...options,
    filters: { user_id: userId },
  });
}

export async function getMyCard(
  client: SupabaseClient<Database>,
  cardId: string,
): Promise<CardRow> {
  return getRowById<CardRow>(client, 'bank_cards', cardId);
}

export async function createCard(
  client: SupabaseClient<Database>,
  userId: string,
  input: CreateCardInput,
): Promise<CardRow> {
  const values = parseOrThrow(createCardSchema, input);
  return insertRow<CardRow>(client, 'bank_cards', { ...values, user_id: userId });
}

export async function updateCard(
  client: SupabaseClient<Database>,
  cardId: string,
  input: UpdateCardInput,
): Promise<CardRow> {
  const values = parseOrThrow(updateCardSchema, input);
  return updateRowById<CardRow>(client, 'bank_cards', cardId, values);
}

export async function deleteCard(client: SupabaseClient<Database>, cardId: string): Promise<void> {
  return deleteRowById(client, 'bank_cards', cardId);
}

/**
 * Example:
 *   await createCard(supabase, userId, {
 *     title: 'Корти асосӣ', bank_name: 'Amonatbank', last4: '4242'
 *   });
 */
