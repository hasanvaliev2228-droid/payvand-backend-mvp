import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import tg from '../src/modules/i18n/translations/tg.json';
import ru from '../src/modules/i18n/translations/ru.json';
import en from '../src/modules/i18n/translations/en.json';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  flattenKeys,
  getSupportedLanguages,
  getTranslations,
  isSupportedLanguage,
  parseAcceptLanguageHeader,
  resolveLanguage,
  t,
} from '../src/modules/i18n/i18n.service';
import { supportedLanguageSchema, updateLanguageSchema } from '../src/modules/i18n/i18n.schema';

describe('All 3 languages exist', () => {
  it('ships exactly tg, ru, en bundles', () => {
    expect(getSupportedLanguages()).toEqual(['tg', 'ru', 'en']);
    expect(SUPPORTED_LANGUAGES).toEqual(['tg', 'ru', 'en']);
  });

  it('each bundle is non-empty and has real string values', () => {
    for (const bundle of [tg, ru, en]) {
      const keys = flattenKeys(bundle);
      expect(keys.length).toBeGreaterThan(0);
    }
  });

  it('getTranslations returns the correct bundle per language', () => {
    expect(getTranslations('tg')).toEqual(tg);
    expect(getTranslations('ru')).toEqual(ru);
    expect(getTranslations('en')).toEqual(en);
  });
});

describe('Translation keys are equal across all 3 languages', () => {
  const tgKeys = flattenKeys(tg);
  const ruKeys = flattenKeys(ru);
  const enKeys = flattenKeys(en);

  it('tg and ru have identical key sets', () => {
    expect(ruKeys).toEqual(tgKeys);
  });

  it('tg and en have identical key sets', () => {
    expect(enKeys).toEqual(tgKeys);
  });

  it('covers every required category: auth, validation, loan, transaction, chat, notification, document, common', () => {
    const categories = ['common', 'auth', 'validation', 'loan', 'transaction', 'chat', 'notification', 'document'];
    for (const category of categories) {
      expect(tgKeys.some((k) => k.startsWith(`${category}.`))).toBe(true);
    }
  });

  it('has no empty string values in any bundle', () => {
    for (const [lang, bundle] of [
      ['tg', tg],
      ['ru', ru],
      ['en', en],
    ] as const) {
      for (const key of flattenKeys(bundle)) {
        const value = key.split('.').reduce<any>((acc, seg) => acc?.[seg], bundle);
        expect(typeof value, `${lang}.${key} should be a string`).toBe('string');
        expect(value.length, `${lang}.${key} should not be empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe('Default language is tg', () => {
  it('DEFAULT_LANGUAGE constant is "tg"', () => {
    expect(DEFAULT_LANGUAGE).toBe('tg');
  });

  it('resolveLanguage() with no header and no profile language returns tg', () => {
    expect(resolveLanguage(undefined, undefined)).toBe('tg');
  });

  it('updateLanguageSchema still requires an explicit language (no silent default) when actually setting a preference', () => {
    expect(updateLanguageSchema.safeParse({}).success).toBe(false);
    expect(updateLanguageSchema.safeParse({ language: 'ru' }).success).toBe(true);
  });
});

describe('Accept-Language header support', () => {
  it('parses a simple header value ("ru")', () => {
    expect(parseAcceptLanguageHeader('ru')).toBe('ru');
  });

  it('parses a complex header value with quality values and region ("ru-RU,ru;q=0.9,en;q=0.8")', () => {
    expect(parseAcceptLanguageHeader('ru-RU,ru;q=0.9,en;q=0.8')).toBe('ru');
  });

  it('parses "en"', () => {
    expect(parseAcceptLanguageHeader('en')).toBe('en');
  });

  it('returns undefined for a missing header', () => {
    expect(parseAcceptLanguageHeader(undefined)).toBeUndefined();
    expect(parseAcceptLanguageHeader(null)).toBeUndefined();
    expect(parseAcceptLanguageHeader('')).toBeUndefined();
  });

  it('resolveLanguage() prefers a valid Accept-Language header over the profile language', () => {
    expect(resolveLanguage('en', 'ru')).toBe('en');
  });

  it('resolveLanguage() falls back to the profile language when no header is given', () => {
    expect(resolveLanguage(undefined, 'ru')).toBe('ru');
  });
});

describe('Invalid language falls back to tg', () => {
  it('an unsupported Accept-Language header (e.g. "fr") falls back to the profile language, then tg', () => {
    expect(resolveLanguage('fr', undefined)).toBe('tg');
    expect(resolveLanguage('fr', 'ru')).toBe('ru');
  });

  it('an unsupported profile language ("zh", still a valid DB value) falls back to tg', () => {
    expect(resolveLanguage(undefined, 'zh')).toBe('tg');
  });

  it('a garbage profile language value falls back to tg', () => {
    expect(resolveLanguage(undefined, 'not-a-real-language')).toBe('tg');
  });

  it('isSupportedLanguage correctly distinguishes tg/ru/en from everything else', () => {
    expect(isSupportedLanguage('tg')).toBe(true);
    expect(isSupportedLanguage('ru')).toBe(true);
    expect(isSupportedLanguage('en')).toBe(true);
    expect(isSupportedLanguage('zh')).toBe(false);
    expect(isSupportedLanguage('fr')).toBe(false);
    expect(isSupportedLanguage(undefined)).toBe(false);
  });

  it('supportedLanguageSchema rejects "zh" (profiles.language superset is intentionally not fully supported for translation)', () => {
    expect(supportedLanguageSchema.safeParse('zh').success).toBe(false);
  });
});

describe('t() translation lookup', () => {
  it('resolves a simple key in every language', () => {
    expect(t('tg', 'common.success')).toBe(tg.common.success);
    expect(t('ru', 'common.success')).toBe(ru.common.success);
    expect(t('en', 'common.success')).toBe(en.common.success);
  });

  it('resolves the chat.not_member key used to replace the hardcoded string', () => {
    expect(t('tg', 'chat.not_member')).toBe('Шумо аъзои ин чат нестед');
    expect(t('ru', 'chat.not_member')).toBe('Вы не являетесь участником этого чата');
    expect(t('en', 'chat.not_member')).toBe('You are not a member of this conversation');
  });

  it('interpolates {{params}} into the resolved string', () => {
    const result = t('en', 'notification.loan_created', { title: 'Car loan' });
    expect(result).toBe('New loan "Car loan" was created');
  });

  it('interpolates multiple params', () => {
    const result = t('ru', 'notification.transaction_created', { amount: 150, currency: 'TJS' });
    expect(result).toContain('150');
    expect(result).toContain('TJS');
  });

  it('leaves an unmatched placeholder untouched if the param is missing', () => {
    const result = t('en', 'notification.loan_created', {});
    expect(result).toContain('{{title}}');
  });
});

describe('Migration: profiles.language index', () => {
  const migrationSql = readFileSync(
    path.resolve(__dirname, '../supabase/migrations/018_user_language.sql'),
    'utf-8',
  );

  it('adds an index on profiles(language) without touching the existing enum/column', () => {
    expect(migrationSql).toMatch(/create index if not exists profiles_language_idx on public\.profiles\(language\)/);
    expect(migrationSql).not.toMatch(/drop column/);
    expect(migrationSql).not.toMatch(/drop type/);
    expect(migrationSql).not.toMatch(/alter column language/);
  });
});
