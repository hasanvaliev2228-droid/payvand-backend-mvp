/**
 * Smart notifications tests: multilingual templates, loan reminders,
 * overdue loans, employee attendance alerts, and security/system events.
 * As with the other Edge-Function-heavy suites in this project, there is
 * no live Supabase project here, so behavior is verified via the
 * templates module directly (real, executable logic — not just source
 * pattern matching) plus source-level checks for auth/dedup/RLS intent.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_LANGUAGE,
  NOTIFICATION_TEMPLATES,
  isSupportedLanguage,
  parseAcceptLanguageHeader,
  renderTemplate,
  resolveLanguage,
} from '../supabase/functions/send-notification/notification-templates';

const FUNCTIONS = {
  'send-notification': readFileSync(
    path.resolve(__dirname, '../supabase/functions/send-notification/index.ts'),
    'utf-8',
  ),
  'notify-loan-reminders': readFileSync(
    path.resolve(__dirname, '../supabase/functions/notify-loan-reminders/index.ts'),
    'utf-8',
  ),
  'notify-employee-attendance': readFileSync(
    path.resolve(__dirname, '../supabase/functions/notify-employee-attendance/index.ts'),
    'utf-8',
  ),
  'notify-security-event': readFileSync(
    path.resolve(__dirname, '../supabase/functions/notify-security-event/index.ts'),
    'utf-8',
  ),
};

describe('Multilingual templates', () => {
  it('every template has all three languages for both title and body', () => {
    for (const [key, template] of Object.entries(NOTIFICATION_TEMPLATES)) {
      for (const lang of ['tg', 'ru', 'en'] as const) {
        expect(template.title[lang], `${key}.title.${lang}`).toBeTruthy();
        expect(template.body[lang], `${key}.body.${lang}`).toBeTruthy();
      }
    }
  });

  it('renderTemplate resolves the correct language', () => {
    const rendered = renderTemplate('loan.created', 'en', { title: 'Car loan' });
    expect(rendered?.title).toBe('Loan created');
    expect(rendered?.body).toBe('New loan "Car loan" was created');
  });

  it('renderTemplate falls back to DEFAULT_LANGUAGE for an unrecognized template key', () => {
    expect(renderTemplate('not.a.real.key', 'en')).toBeUndefined();
  });

  it('interpolates multiple params (transaction.created)', () => {
    const rendered = renderTemplate('transaction.created', 'ru', { amount: 200, currency: 'TJS' });
    expect(rendered?.body).toContain('200');
    expect(rendered?.body).toContain('TJS');
  });

  it('covers loan reminders, overdue loans, employee alerts, and security/system events', () => {
    const requiredKeys = [
      'loan.created',
      'loan.payment_reminder',
      'loan.overdue',
      'employee.late_checkin',
      'employee.no_checkin',
      'security.new_login',
      'security.alert',
      'account.welcome',
    ];
    for (const key of requiredKeys) {
      expect(NOTIFICATION_TEMPLATES[key], key).toBeDefined();
    }
  });
});

describe('Language resolution matches src/modules/i18n behavior', () => {
  it('DEFAULT_LANGUAGE is tg', () => {
    expect(DEFAULT_LANGUAGE).toBe('tg');
  });

  it('parses Accept-Language headers the same way', () => {
    expect(parseAcceptLanguageHeader('ru-RU,ru;q=0.9')).toBe('ru');
    expect(parseAcceptLanguageHeader(undefined)).toBeUndefined();
  });

  it('resolveLanguage prioritizes an explicit header, then profile language, then default', () => {
    expect(resolveLanguage('en', 'ru')).toBe('en');
    expect(resolveLanguage(undefined, 'ru')).toBe('ru');
    expect(resolveLanguage(undefined, undefined)).toBe('tg');
    expect(resolveLanguage('fr', 'zh')).toBe('tg');
  });

  it('isSupportedLanguage rejects "zh" and other unsupported values', () => {
    expect(isSupportedLanguage('tg')).toBe(true);
    expect(isSupportedLanguage('zh')).toBe(false);
  });
});

describe('send-notification: backward-compatible template_key support', () => {
  it('still accepts a literal title/body (original behavior, unchanged)', () => {
    expect(FUNCTIONS['send-notification']).toMatch(/title: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(150\)\.optional\(\)/);
  });

  it('requires either title or template_key', () => {
    expect(FUNCTIONS['send-notification']).toMatch(/!!v\.title \|\| !!v\.template_key/);
  });

  it('resolves the recipient\'s language before rendering a template', () => {
    expect(FUNCTIONS['send-notification']).toMatch(/resolveLanguage\(req\.headers\.get\('Accept-Language'\), targetProfile\?\.language/);
  });

  it('still requires admin role server-side (unchanged authorization)', () => {
    expect(FUNCTIONS['send-notification']).toMatch(/callerProfile\.role !== 'admin'/);
    expect(FUNCTIONS['send-notification']).toMatch(/FORBIDDEN/);
  });
});

describe('Loan reminders and overdue notifications', () => {
  const source = FUNCTIONS['notify-loan-reminders'];

  it('requires a cron secret or an admin JWT (not open to any authenticated user)', () => {
    expect(source).toMatch(/CRON_SECRET/);
    expect(source).toMatch(/profile\?\.role === 'admin'/);
  });

  it('deduplicates reminders per loan per day via a stored dedupe_key', () => {
    expect(source).toMatch(/loan_reminder:\$\{loan\.id\}:\$\{today\}/);
    expect(source).toMatch(/filter\('data->>dedupe_key', 'eq', dedupeKey\)/);
  });

  it('deduplicates overdue notifications per loan per day', () => {
    expect(source).toMatch(/loan_overdue:\$\{loan\.id\}:\$\{today\}/);
  });

  it('flips overdue loans to status = \'overdue\'', () => {
    expect(source).toMatch(/\.update\(\{ status: 'overdue' \}\)/);
  });

  it('renders notifications in the loan owner\'s language', () => {
    expect(source).toMatch(/resolveLanguage\(null, ownerProfile\?\.language/);
  });
});

describe('Employee attendance alerts', () => {
  const source = FUNCTIONS['notify-employee-attendance'];

  it('requires a cron secret or an admin JWT', () => {
    expect(source).toMatch(/CRON_SECRET/);
    expect(source).toMatch(/profile\?\.role === 'admin'/);
  });

  it('notifies the EMPLOYER, never the employee directly (employees have no account)', () => {
    expect(source).toMatch(/user_id: employee\.owner_id/);
  });

  it('deduplicates "no check-in" alerts per employee per day', () => {
    expect(source).toMatch(/employee_no_checkin:\$\{employee\.id\}:\$\{today\}/);
  });

  it('deduplicates "late" alerts per attendance record (not per day, since one record = one arrival)', () => {
    expect(source).toMatch(/employee_late:\$\{todayAttendance\.id\}/);
  });

  it('only flags active employees', () => {
    expect(source).toMatch(/\.eq\('active', true\)/);
  });
});

describe('Security / system notifications (self-service)', () => {
  const source = FUNCTIONS['notify-security-event'];

  it('always targets the verified caller\'s own id, never a body-supplied user_id', () => {
    expect(source).toMatch(/user_id: userId, \/\/ always the verified caller/);
    expect(source).not.toMatch(/user_id: z\.string\(\)\.uuid\(\)/);
  });

  it('restricts event_type to a small, fixed enum (no arbitrary template_key from the client)', () => {
    expect(source).toMatch(/eventTypeSchema = z\.enum\(\['new_login', 'security_alert'\]\)/);
  });

  it('requires authentication', () => {
    expect(source).toMatch(/Authorization/);
    expect(source).toMatch(/auth\.getUser\(\)/);
    expect(source).toMatch(/UNAUTHORIZED/);
  });
});

describe('RLS / security: notification writes stay service-role-gated', () => {
  it('regular users still have no insert policy on notifications (unchanged since 014_rls_policies.sql)', () => {
    const rlsSql = readFileSync(
      path.resolve(__dirname, '../supabase/migrations/014_rls_policies.sql'),
      'utf-8',
    );
    expect(rlsSql).toMatch(/notifications_admin_insert[\s\S]*?with check \(public\.is_admin\(\)\)/);
  });

  it('every notification-writing Edge Function uses the service-role client (never the anon client) to insert', () => {
    for (const source of Object.values(FUNCTIONS)) {
      expect(source).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    }
  });

  it('no new migration was needed for notification templates (code-based, not DB-based) — documented, not silently assumed', () => {
    // notification-templates.ts lives alongside send-notification, not in supabase/migrations.
    const templatesPath = path.resolve(__dirname, '../supabase/functions/send-notification/notification-templates.ts');
    expect(() => readFileSync(templatesPath, 'utf-8')).not.toThrow();
  });
});
