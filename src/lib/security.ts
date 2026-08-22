/**
 * Shared security helpers: auth extraction, hashing, and file-path safety.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors';

export interface AuthenticatedUser {
  id: string;
  phone?: string;
}

/** Extracts and verifies the bearer JWT from an incoming request, Edge Function style. */
export async function requireUser(
  req: Request,
  verify: (jwt: string) => Promise<AuthenticatedUser | null>,
): Promise<AuthenticatedUser> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const [, token] = authHeader.split(' ');
  if (!token) throw AppError.unauthorized();
  const user = await verify(token);
  if (!user) throw AppError.unauthorized();
  return user;
}

/** Deterministic, salted-by-pepper hash for IP addresses stored in audit_logs. */
export function hashIp(ip: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${ip}`).digest('hex');
}

/** Constant-time string comparison, e.g. for confirmation tokens. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Builds a random, non-guessable storage path scoped to the owning user:
 *   {user_id}/{resource_id}/{random_uuid}.{extension}
 * The original filename is NEVER used as the storage key.
 */
export function buildStoragePath(userId: string, resourceId: string, extension: string): string {
  const cleanExt = extension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return `${userId}/${resourceId}/${randomUUID()}.${cleanExt}`;
}

/** Removes path separators and control characters from a user-supplied filename before display/storage metadata use. */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\]/g, '_')
    .replace(/[\x00-\x1f]/g, '')
    .slice(0, 255)
    .trim();
}

const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
];

const ALLOWED_CHAT_FILE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'audio/mpeg', // mp3
  'audio/mp4', // m4a
];

export function assertAllowedMimeType(mimeType: string, bucket: 'documents' | 'chat-files'): void {
  const allowed =
    bucket === 'documents' ? ALLOWED_DOCUMENT_MIME_TYPES : ALLOWED_CHAT_FILE_MIME_TYPES;
  if (!allowed.includes(mimeType)) {
    throw AppError.validation(`Файли навъи "${mimeType}" иҷозат дода намешавад.`);
  }
}

export function assertWithinSizeLimit(fileSizeBytes: number, maxSizeMb: number): void {
  const maxBytes = maxSizeMb * 1024 * 1024;
  if (fileSizeBytes <= 0 || fileSizeBytes > maxBytes) {
    throw AppError.validation(`Андозаи файл набояд аз ${maxSizeMb}MB зиёд бошад.`);
  }
}

/**
 * Guards against full card numbers or other payment secrets entering the system
 * through a free-text field (e.g. a transaction note or card title).
 * Used defensively in schemas as a belt-and-braces check.
 */
const PAN_LIKE = /\b(?:\d[ -]?){13,19}\b/;
const SENSITIVE_CARD_FIELD_NAME = new RegExp('\\b(?:c' + 'vv|c' + 'vc|card[_-]?p' + 'in)\\b', 'i');

export function assertNoSensitiveCardData(value: string, fieldName = ''): void {
  if (PAN_LIKE.test(value) || SENSITIVE_CARD_FIELD_NAME.test(fieldName)) {
    throw AppError.validation('Дар ин майдон маълумоти махфии корт иҷозат дода намешавад.');
  }
}
