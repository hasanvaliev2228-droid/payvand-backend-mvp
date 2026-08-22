/**
 * Contacts module.
 * Security note: RLS (contacts_owner_all) restricts rows to owner_id.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import { deleteRowById, insertRow, listRows, updateRowById } from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import { createContactSchema, updateContactSchema, type CreateContactInput, type UpdateContactInput } from './contacts.schema';
import type { ListResult } from '../../types/api.types';

type ContactRow = Database['public']['Tables']['contacts']['Row'];

export async function listMyContacts(
  client: SupabaseClient<Database>,
  userId: string,
  options: Omit<ListOptions, 'filters'>,
): Promise<ListResult<ContactRow>> {
  return listRows<ContactRow>(client, 'contacts', { ...options, filters: { owner_id: userId } });
}

export async function createContact(
  client: SupabaseClient<Database>,
  userId: string,
  input: CreateContactInput,
): Promise<ContactRow> {
  const values = parseOrThrow(createContactSchema, input);
  return insertRow<ContactRow>(client, 'contacts', { ...values, owner_id: userId });
}

export async function updateContact(
  client: SupabaseClient<Database>,
  id: string,
  input: UpdateContactInput,
): Promise<ContactRow> {
  const values = parseOrThrow(updateContactSchema, input);
  return updateRowById<ContactRow>(client, 'contacts', id, values);
}

export async function deleteContact(client: SupabaseClient<Database>, id: string): Promise<void> {
  return deleteRowById(client, 'contacts', id);
}
