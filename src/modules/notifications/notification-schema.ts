import { z } from 'zod';

/** NTF-01 (D-068): per-user channel preferences; all default on. */
export const notificationPreferencesSchema = z.object({
  inAppEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  emailEnabled: z.boolean(),
}).strict();
