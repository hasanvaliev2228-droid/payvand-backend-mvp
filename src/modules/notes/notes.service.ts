/**
 * Notes / digital notebook module.
 * Security note: RLS (notes_owner_all, 016_notes.sql) scopes every row to
 * user_id — a user can only ever see/edit/delete their own notes. This
 * module's client is always the caller's RLS-scoped SupabaseClient; it
 * never uses the service-role admin client.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import {
  deleteRowById,
  getRowById,
  insertRow,
  updateRowById,
} from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import { AppError } from '../../lib/errors';
import {
  createNoteSchema,
  noteFilterSchema,
  updateNoteSchema,
  type CreateNoteInput,
  type NoteFilterInput,
  type UpdateNoteInput,
} from './notes.schema';
import type { NoteRow } from './notes.types';
import type { ListResult } from '../../types/api.types';

export async function listMyNotes(
  client: SupabaseClient<Database>,
  userId: string,
  options: Omit<ListOptions, 'filters'>,
  rawFilters: NoteFilterInput = {},
): Promise<ListResult<NoteRow>> {
  const filters = parseOrThrow(noteFilterSchema, rawFilters);

  let query = client.from('notes').select('*', { count: 'exact' }).eq('user_id', userId);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.hasReminder === true) query = query.not('reminder_at', 'is', null);
  if (filters.hasReminder === false) query = query.is('reminder_at', null);

  const { page, pageSize, sortBy, sortDir } = options;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.order(sortBy ?? 'created_at', { ascending: sortDir === 'asc' }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw AppError.internal(error.message);

  return {
    items: (data ?? []) as NoteRow[],
    page,
    pageSize,
    total: count ?? 0,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  };
}

export async function getMyNote(client: SupabaseClient<Database>, id: string): Promise<NoteRow> {
  return getRowById<NoteRow>(client, 'notes', id);
}

export async function createNote(
  client: SupabaseClient<Database>,
  userId: string,
  input: CreateNoteInput,
): Promise<NoteRow> {
  const values = parseOrThrow(createNoteSchema, input);
  return insertRow<NoteRow>(client, 'notes', { ...values, user_id: userId });
}

export async function updateNote(
  client: SupabaseClient<Database>,
  id: string,
  input: UpdateNoteInput,
): Promise<NoteRow> {
  const values = parseOrThrow(updateNoteSchema, input);
  return updateRowById<NoteRow>(client, 'notes', id, values);
}

export async function deleteNote(client: SupabaseClient<Database>, id: string): Promise<void> {
  return deleteRowById(client, 'notes', id);
}

/**
 * Example:
 *   await createNote(supabase, userId, {
 *     title: 'Хариди бозор', content: 'Нон, шир, тухм', category: 'рӯзгор',
 *   });
 */
