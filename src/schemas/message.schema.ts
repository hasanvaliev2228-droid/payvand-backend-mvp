import { z } from 'zod';

export const conversationTypeSchema = z.enum(['direct', 'group']);

export const createConversationSchema = z.object({
  type: conversationTypeSchema,
  title: z.string().trim().min(1).max(120).optional(),
  member_ids: z.array(z.string().uuid()).min(1).max(256),
  image_path: z.string().max(500).optional(),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const messageTypeSchema = z.enum(['text', 'image', 'voice', 'file', 'audio', 'system']);

/**
 * Message attachment payload. `file_path` is the LEGACY generic-document
 * path (still accepted for backward compatibility with existing 'image' |
 * 'file' | 'audio' messages). `file_url` is the new chat-media path
 * returned by upload-chat-media (see supabase/functions/upload-chat-media),
 * used for 'image' | 'voice' | 'file' messages going forward. A message
 * needs at least one of the two for non-text/system types.
 */
export const sendMessageSchema = z
  .object({
    conversation_id: z.string().uuid(),
    message_type: messageTypeSchema.default('text'),
    body: z.string().trim().max(4000).optional(),
    file_path: z.string().max(500).optional(),
    file_url: z.string().max(500).optional(),
    file_name: z.string().trim().max(255).optional(),
    file_size: z.number().int().positive().optional(),
    mime_type: z.string().trim().max(150).optional(),
    voice_duration_seconds: z.number().int().positive().max(3600).optional(),
    reply_to_id: z.string().uuid().optional(),
    forwarded_from_id: z.string().uuid().optional(),
  })
  .refine((v) => (v.message_type === 'text' ? !!v.body : true), {
    message: 'Паёми матнӣ бояд текст дошта бошад.',
    path: ['body'],
  })
  .refine(
    (v) =>
      !['image', 'file', 'audio', 'voice'].includes(v.message_type) || !!v.file_path || !!v.file_url,
    {
      message: 'Паёми расм/файл/овозӣ бояд file_url (ё file_path) дошта бошад.',
      path: ['file_url'],
    },
  )
  .refine((v) => v.message_type !== 'voice' || v.voice_duration_seconds !== undefined, {
    message: 'Паёми овозӣ бояд voice_duration_seconds дошта бошад.',
    path: ['voice_duration_seconds'],
  })
  .refine((v) => v.message_type !== 'file' || !!v.file_name || !!v.file_path, {
    message: 'Паёми файлӣ бояд file_name дошта бошад.',
    path: ['file_name'],
  });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  message_id: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});
export type EditMessageInput = z.infer<typeof editMessageSchema>;

export const addReactionSchema = z.object({
  message_id: z.string().uuid(),
  emoji: z.string().trim().min(1).max(8),
});
export type AddReactionInput = z.infer<typeof addReactionSchema>;

export const markReadSchema = z.object({
  conversation_id: z.string().uuid(),
});
export type MarkReadInput = z.infer<typeof markReadSchema>;

export const addMemberSchema = z.object({
  conversation_id: z.string().uuid(),
  user_id: z.string().uuid(),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;
