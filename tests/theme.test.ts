/**
 * Theme settings tests. Confirms this feature is a thin wrapper around the
 * EXISTING user_settings.theme column (003_user_settings.sql) rather than
 * a duplicate/new table, and that light/dark switching is validated and
 * owner-scoped.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { updateThemeSchema } from '../src/modules/theme/theme.schema';
import { updateUserSettingsSchema } from '../src/schemas/profile.schema';

const themeFnSource = readFileSync(
  path.resolve(__dirname, '../supabase/functions/update-theme/index.ts'),
  'utf-8',
);
const userSettingsMigration = readFileSync(
  path.resolve(__dirname, '../supabase/migrations/003_user_settings.sql'),
  'utf-8',
);

describe('No duplicate migration: reuses the existing user_settings.theme column', () => {
  it('003_user_settings.sql already defines theme with light/dark/system + a default', () => {
    expect(userSettingsMigration).toMatch(
      /theme text not null default 'system' check \(theme in \('light', 'dark', 'system'\)\)/,
    );
  });

  it('no new theme-specific migration file was created', () => {
    const migrationsDir = path.resolve(__dirname, '../supabase/migrations');
    const files = readdirSync(migrationsDir);
    const themeMigrations = files.filter((f: string) => /theme/i.test(f));
    expect(themeMigrations).toEqual([]);
  });
});

describe('Validation', () => {
  it('updateThemeSchema accepts "light"', () => {
    expect(updateThemeSchema.safeParse({ theme: 'light' }).success).toBe(true);
  });

  it('updateThemeSchema accepts "dark"', () => {
    expect(updateThemeSchema.safeParse({ theme: 'dark' }).success).toBe(true);
  });

  it('updateThemeSchema rejects "system" (this module\'s focused surface is light/dark only)', () => {
    expect(updateThemeSchema.safeParse({ theme: 'system' }).success).toBe(false);
  });

  it('updateThemeSchema rejects an arbitrary string', () => {
    expect(updateThemeSchema.safeParse({ theme: 'solarized' }).success).toBe(false);
  });

  it('updateThemeSchema requires the theme field', () => {
    expect(updateThemeSchema.safeParse({}).success).toBe(false);
  });

  it('the broader updateUserSettingsSchema is untouched and still accepts "system" (existing feature preserved)', () => {
    expect(updateUserSettingsSchema.safeParse({ theme: 'system' }).success).toBe(true);
    expect(updateUserSettingsSchema.safeParse({ theme: 'light' }).success).toBe(true);
    expect(updateUserSettingsSchema.safeParse({ theme: 'dark' }).success).toBe(true);
  });
});

describe('Edge Function: update-theme', () => {
  it('requires authentication', () => {
    expect(themeFnSource).toMatch(/Authorization/);
    expect(themeFnSource).toMatch(/auth\.getUser\(\)/);
    expect(themeFnSource).toMatch(/UNAUTHORIZED/);
  });

  it('supports GET (read current theme) and POST (update theme)', () => {
    expect(themeFnSource).toMatch(/req\.method === 'GET'/);
    expect(themeFnSource).toMatch(/bodySchema\.safeParse/);
  });

  it('scopes every read/write to the caller\'s own user_id', () => {
    const occurrences = themeFnSource.match(/\.eq\('user_id', userId\)/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2); // GET path + POST path
  });

  it('never uses the service-role key (RLS on user_settings is sufficient — least privilege)', () => {
    expect(themeFnSource).not.toMatch(/SERVICE_ROLE/);
  });

  it('returns the uniform { ok, ... } envelope', () => {
    expect(themeFnSource).toMatch(/ok: true/);
    expect(themeFnSource).toMatch(/ok: false/);
  });
});

describe('RLS: user_settings ownership is unchanged', () => {
  it('user_settings_owner_all still scopes every row to user_id = auth.uid()', () => {
    const rlsSql = readFileSync(
      path.resolve(__dirname, '../supabase/migrations/014_rls_policies.sql'),
      'utf-8',
    );
    expect(rlsSql).toMatch(
      /create policy user_settings_owner_all on public\.user_settings\s*\n\s*for all using \(user_id = auth\.uid\(\)\) with check \(user_id = auth\.uid\(\)\);/,
    );
  });
});
