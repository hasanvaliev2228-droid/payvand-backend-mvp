import { z } from 'zod';

export const documentMimeTypeSchema = z.enum([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(150),
  original_filename: z.string().trim().min(1).max(255),
  mime_type: documentMimeTypeSchema,
  file_size: z.number().int().positive(),
  folder: z.string().trim().max(80).default('general'),
  document_type: z.string().trim().max(80).optional(),
  is_private: z.boolean().default(true),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  folder: z.string().trim().max(80).optional(),
  document_type: z.string().trim().max(80).optional(),
  signature_status: z.enum(['unsigned', 'signed', 'pending']).optional(),
});
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const generateUploadUrlSchema = z.object({
  bucket: z.enum(['avatars', 'documents', 'chat-files', 'qr-images']),
  mime_type: z.string().min(1),
  file_size: z.number().int().positive(),
  resource_id: z.string().uuid().optional(),
  extension: z.string().trim().min(1).max(10),
});
export type GenerateUploadUrlInput = z.infer<typeof generateUploadUrlSchema>;
