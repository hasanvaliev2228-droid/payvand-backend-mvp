/**
 * Auth module: thin, typed wrapper around Supabase Auth's phone/OTP flow,
 * plus PIN management. Supabase (GoTrue) is the actual identity provider —
 * this module never re-implements OTP delivery or verification itself.
 *
 * Security note:
 * - The raw OTP code is generated, sent, and verified entirely inside
 *   Supabase Auth / the configured SMS provider; it is NEVER written to any
 *   application table (see 002_roles_profiles.sql — profiles has no otp
 *   column, by design).
 * - The in-app PIN is hashed with a strong KDF (scrypt) before storage;
 *   verifyPin() re-hashes and compares, it never reads back a plaintext PIN.
 * - Biometric unlock is a frontend-only concept (device secure enclave); the
 *   backend only stores the `biometric_enabled` boolean preference.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Database } from '../../types/database.types';
import { parseOrThrow } from '../../lib/validation';
import { setPinSchema, type SetPinInput } from '../../schemas/profile.schema';
import { AppError } from '../../lib/errors';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '../i18n/i18n.service';

export interface PhoneOtpRequestInput {
  phone: string;
}

/** Kicks off Supabase's phone OTP flow (delegates entirely to GoTrue/SMS provider). */
export async function requestPhoneOtp(
  client: SupabaseClient<Database>,
  input: PhoneOtpRequestInput,
): Promise<void> {
  const { error } = await client.auth.signInWithOtp({ phone: input.phone });
  if (error) throw AppError.validation(error.message);
}

export interface VerifyOtpInput {
  phone: string;
  token: string;
}

export async function verifyPhoneOtp(
  client: SupabaseClient<Database>,
  input: VerifyOtpInput,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): Promise<{ userId: string; accessToken: string; refreshToken: string }> {
  const { data, error } = await client.auth.verifyOtp({
    phone: input.phone,
    token: input.token,
    type: 'sms',
  });
  if (error || !data.session || !data.user) {
    throw AppError.translated('UNAUTHORIZED', lang, 'auth.invalid_otp');
  }
  return {
    userId: data.user.id,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

export async function signOut(client: SupabaseClient<Database>): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) throw AppError.internal(error.message);
}

// ---------------------------------------------------------------------------
// PIN hashing (scrypt, Node's built-in KDF — no extra dependency needed).
// ---------------------------------------------------------------------------

const SCRYPT_KEYLEN = 64;

export function hashPin(rawPin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(rawPin, salt, SCRYPT_KEYLEN);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPinHash(rawPin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(rawPin, salt, SCRYPT_KEYLEN);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export async function setUserPin(
  client: SupabaseClient<Database>,
  userId: string,
  input: SetPinInput,
): Promise<void> {
  const { pin } = parseOrThrow(setPinSchema, input);
  const pin_hash = hashPin(pin);
  const { error } = await client
    .from('user_settings')
    .update({ pin_hash })
    .eq('user_id', userId);
  if (error) throw AppError.internal(error.message);
}
