import { z } from 'zod';

export const sendNotificationSchema = z.object({
  user_id: z.string().uuid(),
  title: z.string().trim().min(1).max(150),
  body: z.string().trim().max(500).optional(),
  notification_type: z.string().trim().max(50).default('general'),
  data: z.record(z.unknown()).default({}),
});
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;

export const registerDeviceTokenSchema = z.object({
  token: z.string().trim().min(1).max(500),
  platform: z.enum(['ios', 'android', 'web']),
});
export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenSchema>;

export const offlineSyncEventSchema = z.object({
  client_event_id: z.string().trim().min(1).max(100),
  entity_type: z.string().trim().min(1).max(50),
  entity_id: z.string().uuid().optional(),
  operation: z.enum(['create', 'update', 'delete']),
  payload: z.record(z.unknown()),
  client_created_at: z.string().datetime(),
});
export type OfflineSyncEventInput = z.infer<typeof offlineSyncEventSchema>;

export const syncOfflineEventsBatchSchema = z.object({
  events: z.array(offlineSyncEventSchema).min(1).max(200),
});
export type SyncOfflineEventsBatchInput = z.infer<typeof syncOfflineEventsBatchSchema>;
