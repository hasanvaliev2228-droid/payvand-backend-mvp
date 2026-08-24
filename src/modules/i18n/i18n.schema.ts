import { z } from 'zod';

/**
 * The three languages Payvand ships translations for. The `profiles.language`
 * DB column (002_roles_profiles.sql) is a superset enum (`tg | ru | en | zh`)
 * kept intentionally unchanged for forward-compatibility — 'zh' is a valid
 * profile setting today even though no translation bundle exists for it yet.
 * The i18n layer treats any profile/header language outside this schema
 * (including 'zh') as "unsupported for translation" and falls back to
 * DEFAULT_LANGUAGE, exactly like an invalid/missing value would.
 */
export const supportedLanguageSchema = z.enum(['tg', 'ru', 'en']);
export type SupportedLanguage = z.infer<typeof supportedLanguageSchema>;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'tg';

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['tg', 'ru', 'en'];

/** Loose input schema for a raw Accept-Language header value (e.g. "ru-RU,ru;q=0.9,en;q=0.8"). */
export const acceptLanguageHeaderSchema = z.string().trim().min(1).max(200).optional();

/** Input schema for updating a user's stored language preference via an API surface. */
export const updateLanguageSchema = z.object({
  language: supportedLanguageSchema,
});
export type UpdateLanguageInput = z.infer<typeof updateLanguageSchema>;

/** Simple {{name}}-style interpolation params for a translated string. */
export const translationParamsSchema = z.record(z.union([z.string(), z.number()])).optional();
export type TranslationParams = z.infer<typeof translationParamsSchema>;
