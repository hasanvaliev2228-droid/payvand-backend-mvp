/**
 * Translation (i18n) service. Provides:
 *   - t(lang, key, params?) — resolve a dotted translation key to a string,
 *     with {{param}} interpolation and a safe fallback if the key is
 *     somehow missing (never throws for a user-facing lookup).
 *   - resolveLanguage(...) — decides which language to respond in, given an
 *     optional Accept-Language header value and/or the caller's stored
 *     profile.language, defaulting to DEFAULT_LANGUAGE ('tg').
 *
 * Translation keys are TYPE-SAFE: `TranslationKey` is derived directly from
 * the shape of translations/tg.json (the source-of-truth bundle), so an
 * unknown key is a TypeScript compile error, not a runtime surprise.
 */
import tg from './translations/tg.json';
import ru from './translations/ru.json';
import en from './translations/en.json';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  supportedLanguageSchema,
  type SupportedLanguage,
  type TranslationParams,
} from './i18n.schema';

// ---------------------------------------------------------------------------
// Type-safe translation keys, derived from the tg.json shape.
// ---------------------------------------------------------------------------

type TranslationTree = typeof tg;

/** Recursively builds a union of dotted key paths, e.g. "chat.not_member". */
type DotPaths<T, Prefix extends string = ''> = T extends string
  ? Prefix extends '' // never reached at the root, but keeps the type total
    ? never
    : Prefix
  : {
      [K in keyof T & string]: DotPaths<T[K], Prefix extends '' ? K : `${Prefix}.${K}`>;
    }[keyof T & string];

export type TranslationKey = DotPaths<TranslationTree>;

const TRANSLATIONS: Record<SupportedLanguage, TranslationTree> = { tg, ru, en };

// ---------------------------------------------------------------------------
// Lookup + interpolation
// ---------------------------------------------------------------------------

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Resolves a translation key for the given language. Falls back to
 * DEFAULT_LANGUAGE if the key is missing in `lang`'s bundle (bundles are
 * kept in lockstep by tests/i18n.test.ts, so this should not normally
 * happen), and finally to the raw key string if it's missing everywhere —
 * a lookup NEVER throws, since a missing translation should never break a
 * user-facing request.
 */
export function t(lang: SupportedLanguage, key: TranslationKey, params?: TranslationParams): string {
  const primary = getByPath(TRANSLATIONS[lang], key);
  if (typeof primary === 'string') return interpolate(primary, params);

  const fallback = getByPath(TRANSLATIONS[DEFAULT_LANGUAGE], key);
  if (typeof fallback === 'string') return interpolate(fallback, params);

  return key;
}

// ---------------------------------------------------------------------------
// Language resolution
// ---------------------------------------------------------------------------

/**
 * Extracts the primary language subtag from a raw Accept-Language header
 * value, e.g. "ru-RU,ru;q=0.9,en;q=0.8" -> "ru", "tg" -> "tg". Returns
 * undefined for an empty/unparsable header.
 */
export function parseAcceptLanguageHeader(header?: string | null): string | undefined {
  if (!header) return undefined;
  const firstTag = header.split(',')[0]?.trim().split(';')[0]?.trim();
  if (!firstTag) return undefined;
  return firstTag.split('-')[0].toLowerCase();
}

/**
 * Resolves the effective language for a request:
 *   1. An explicit, valid Accept-Language value (if provided) wins.
 *   2. Otherwise, the user's stored profile.language, IF it's one of the
 *      three supported languages (a profile set to 'zh', or anything else
 *      not in SUPPORTED_LANGUAGES, is treated as unsupported here).
 *   3. Otherwise, DEFAULT_LANGUAGE ('tg').
 * This function never throws and never returns an unsupported value.
 */
export function resolveLanguage(
  acceptLanguageHeader?: string | null,
  profileLanguage?: string | null,
): SupportedLanguage {
  const fromHeader = parseAcceptLanguageHeader(acceptLanguageHeader ?? undefined);
  const headerResult = supportedLanguageSchema.safeParse(fromHeader);
  if (headerResult.success) return headerResult.data;

  const profileResult = supportedLanguageSchema.safeParse(profileLanguage ?? undefined);
  if (profileResult.success) return profileResult.data;

  return DEFAULT_LANGUAGE;
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return supportedLanguageSchema.safeParse(value).success;
}

export function getSupportedLanguages(): readonly SupportedLanguage[] {
  return SUPPORTED_LANGUAGES;
}

/** Full raw translation bundle for a language — used by tests and admin tooling. */
export function getTranslations(lang: SupportedLanguage): TranslationTree {
  return TRANSLATIONS[lang];
}

/** Flattens a nested translation object into dotted key paths, e.g. ["chat.not_member", ...]. */
export function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as Record<string, unknown>, full));
    } else {
      keys.push(full);
    }
  }
  return keys.sort();
}

export { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES };
export type { SupportedLanguage };
