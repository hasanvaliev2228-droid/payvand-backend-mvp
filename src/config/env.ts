/**
 * Centralised, validated environment access. Every other module reads
 * configuration through this file instead of touching process.env directly,
 * so a missing/invalid var fails fast with a clear message.
 */
import { z } from 'zod';

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_PROJECT_REF: z.string().optional(),
  SUPABASE_DB_PASSWORD: z.string().optional(),
  STORAGE_MAX_FILE_SIZE_MB: z.coerce.number().positive().default(10),
  UPLOAD_URL_EXPIRY_SECONDS: z.coerce.number().positive().default(300),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PUSH_PROVIDER: z.enum(['mock', 'firebase']).default('mock'),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  // OCR/AI document scanner (src/modules/ocr). Read server-side ONLY — this
  // key must never be sent to, or readable by, the frontend. When unset,
  // the OCR provider falls back to a safe mock (see ocr.service.ts).
  OCR_PROVIDER: z.enum(['disabled', 'google_vision']).default('disabled'),
  OCR_API_KEY: z.string().optional(),
  BARCODE_PROVIDER: z.enum(['disabled', 'open_food_facts']).default('disabled'),
  // Server-side-only key for the Gemini AI adapter. Never expose to clients.
  GEMINI_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}
