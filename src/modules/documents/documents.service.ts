/**
 * Documents module. Actual file bytes go to Supabase Storage via a signed
 * upload URL (see supabase/functions/generate-upload-url and upload-document);
 * this service only manages the metadata row.
 *
 * Security note: RLS (documents_owner_all) scopes every row to user_id.
 * Documents default to private (is_private = true). Storage bucket policies
 * (docs/storage.md) additionally verify the {user_id}/... path prefix on
 * every object operation, so even a leaked object path from another user
 * cannot be read without also passing the DB-row ownership check.
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
  createDocumentSchema,
  updateDocumentSchema,
  type CreateDocumentInput,
  type UpdateDocumentInput,
} from '../../schemas/document.schema';
import type { ListResult } from '../../types/api.types';
import { buildStoragePath, sanitizeFilename } from '../../lib/security';

type DocumentRow = Database['public']['Tables']['documents']['Row'];

export async function listMyDocuments(
  client: SupabaseClient<Database>,
  userId: string,
  options: Omit<ListOptions, 'filters'> & { folder?: string },
): Promise<ListResult<DocumentRow>> {
  const { folder, ...rest } = options;
  return listRows<DocumentRow>(client, 'documents', {
    ...rest,
    filters: { user_id: userId, folder },
  });
}

export async function getMyDocument(
  client: SupabaseClient<Database>,
  id: string,
): Promise<DocumentRow> {
  return getRowById<DocumentRow>(client, 'documents', id);
}

/**
 * Registers document metadata AFTER the file bytes have already been
 * uploaded to Storage via a signed URL from generate-upload-url. The random
 * storage path (never the original filename) becomes file_path.
 */
export async function createDocument(
  client: SupabaseClient<Database>,
  userId: string,
  documentId: string,
  extension: string,
  input: CreateDocumentInput,
): Promise<DocumentRow> {
  const values = parseOrThrow(createDocumentSchema, input);
  const storedFilename = sanitizeFilename(`${values.title}.${extension}`);
  const filePath = buildStoragePath(userId, documentId, extension);
  return insertRow<DocumentRow>(client, 'documents', {
    ...values,
    id: documentId,
    user_id: userId,
    stored_filename: storedFilename,
    original_filename: sanitizeFilename(values.original_filename),
    file_path: filePath,
    scan_status: 'pending_scan',
  });
}

export async function updateDocument(
  client: SupabaseClient<Database>,
  id: string,
  input: UpdateDocumentInput,
): Promise<DocumentRow> {
  const values = parseOrThrow(updateDocumentSchema, input);
  return updateRowById<DocumentRow>(client, 'documents', id, values);
}

export async function deleteDocument(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  return deleteRowById(client, 'documents', id);
}
