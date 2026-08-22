/**
 * Validation for chat attachments (images, voice messages, files), shared by
 * the upload-chat-media Edge Function and the send-message Edge Function.
 * Keeping the limits here (not duplicated) means both functions and any
 * future client-side pre-check stay in sync.
 */
import { z } from 'zod';

export const chatMediaKindSchema = z.enum(['image', 'voice', 'file']);
export type ChatMediaKind = z.infer<typeof chatMediaKindSchema>;

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ALLOWED_VOICE_MIME_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/wav'] as const;
export const ALLOWED_FILE_MIME_TYPES = [
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
] as const;

export const ALL_CHAT_MEDIA_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_VOICE_MIME_TYPES,
  ...ALLOWED_FILE_MIME_TYPES,
] as const;

/** Maximum size per attachment kind, in bytes. */
export const MAX_SIZE_BYTES: Record<ChatMediaKind, number> = {
  image: 10 * 1024 * 1024, // 10MB
  voice: 20 * 1024 * 1024, // 20MB
  file: 25 * 1024 * 1024, // 25MB
};

const MIME_TO_KIND: Record<string, ChatMediaKind> = Object.fromEntries([
  ...ALLOWED_IMAGE_MIME_TYPES.map((m) => [m, 'image' as const]),
  ...ALLOWED_VOICE_MIME_TYPES.map((m) => [m, 'voice' as const]),
  ...ALLOWED_FILE_MIME_TYPES.map((m) => [m, 'file' as const]),
]);

/** Returns the attachment kind for an allowed MIME type, or undefined if disallowed. */
export function kindForMimeType(mimeType: string): ChatMediaKind | undefined {
  return MIME_TO_KIND[mimeType];
}

export function isAllowedChatMediaMimeType(mimeType: string): boolean {
  return mimeType in MIME_TO_KIND;
}

export function maxSizeForMimeType(mimeType: string): number | undefined {
  const kind = kindForMimeType(mimeType);
  return kind ? MAX_SIZE_BYTES[kind] : undefined;
}

/** Maps an attachment kind to its folder name under {user_id}/... in the chat-media bucket. */
export const FOLDER_BY_KIND: Record<ChatMediaKind, string> = {
  image: 'images',
  voice: 'voice',
  file: 'files',
};

export const uploadChatMediaSchema = z.object({
  conversation_id: z.string().uuid(),
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(ALL_CHAT_MEDIA_MIME_TYPES, {
    errorMap: () => ({ message: 'Навъи файл иҷозат дода намешавад.' }),
  }),
  // Base64-encoded file content. Edge Function validates decoded byte length
  // against MAX_SIZE_BYTES for the resolved kind before ever touching Storage.
  file_base64: z.string().min(1),
  // Only meaningful/required when the resolved kind is 'voice'; validated in
  // the Edge Function (schema-level optionality keeps one shared schema for
  // all three kinds).
  voice_duration_seconds: z.number().int().positive().max(3600).optional(),
});
export type UploadChatMediaInput = z.infer<typeof uploadChatMediaSchema>;
