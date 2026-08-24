// supabase/functions/send-notification/notification-templates.ts
// Self-contained per-function copy of the notification-relevant subset of
// src/modules/i18n/translations/*.json. Edge Functions are deployed
// standalone (Deno, not bundled with src/ — see the existing convention in
// generate-upload-url/index.ts and upload-chat-media/index.ts, which
// duplicate their MIME/size lists rather than importing across that
// boundary), so this file intentionally mirrors — rather than imports —
// the notification.* keys. Keep it in sync with
// src/modules/i18n/translations/*.json when adding/changing a template key.
export type SupportedLanguage = 'tg' | 'ru' | 'en';
export const DEFAULT_LANGUAGE: SupportedLanguage = 'tg';

export interface NotificationTemplate {
  title: Record<SupportedLanguage, string>;
  body: Record<SupportedLanguage, string>;
}

export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  'loan.created': {
    title: { tg: 'Қарз сохта шуд', ru: 'Кредит создан', en: 'Loan created' },
    body: {
      tg: 'Қарзи нав бо номи "{{title}}" сохта шуд',
      ru: 'Создан новый кредит «{{title}}»',
      en: 'New loan "{{title}}" was created',
    },
  },
  'loan.payment_reminder': {
    title: { tg: 'Ёдраскунии пардохт', ru: 'Напоминание о платеже', en: 'Payment reminder' },
    body: {
      tg: 'Мӯҳлати пардохти қарзи "{{title}}" наздик аст ({{due_date}})',
      ru: 'Срок платежа по кредиту «{{title}}» приближается ({{due_date}})',
      en: 'Payment for loan "{{title}}" is due soon ({{due_date}})',
    },
  },
  'loan.overdue': {
    title: { tg: 'Қарз гузаштааст', ru: 'Кредит просрочен', en: 'Loan overdue' },
    body: {
      tg: 'Мӯҳлати пардохти қарзи "{{title}}" гузаштааст',
      ru: 'Срок погашения кредита «{{title}}» истёк',
      en: 'Loan "{{title}}" is now overdue',
    },
  },
  'transaction.created': {
    title: { tg: 'Амалиёт сабт шуд', ru: 'Операция записана', en: 'Transaction recorded' },
    body: {
      tg: 'Амалиёти нав ба маблағи {{amount}} {{currency}} сабт шуд',
      ru: 'Записана новая операция на сумму {{amount}} {{currency}}',
      en: 'New transaction of {{amount}} {{currency}} recorded',
    },
  },
  'chat.new_message': {
    title: { tg: 'Паёми нав', ru: 'Новое сообщение', en: 'New message' },
    body: {
      tg: 'Паёми нав аз {{sender}}',
      ru: 'Новое сообщение от {{sender}}',
      en: 'New message from {{sender}}',
    },
  },
  'document.uploaded': {
    title: { tg: 'Ҳуҷҷат бор карда шуд', ru: 'Документ загружен', en: 'Document uploaded' },
    body: {
      tg: 'Ҳуҷҷати нав "{{title}}" бор карда шуд',
      ru: 'Загружен новый документ «{{title}}»',
      en: 'New document "{{title}}" uploaded',
    },
  },
  'employee.late_checkin': {
    title: { tg: 'Дер омадан', ru: 'Опоздание', en: 'Late arrival' },
    body: {
      tg: '{{employee_name}} дер омад ({{check_in_time}})',
      ru: '{{employee_name}} опоздал(а) ({{check_in_time}})',
      en: '{{employee_name}} arrived late ({{check_in_time}})',
    },
  },
  'employee.no_checkin': {
    title: { tg: 'Check-in нашудааст', ru: 'Отметка о приходе отсутствует', en: 'No check-in recorded' },
    body: {
      tg: '{{employee_name}} имрӯз check-in накардааст',
      ru: '{{employee_name}} сегодня не отметил(а) приход',
      en: '{{employee_name}} has not checked in today',
    },
  },
  'security.new_login': {
    title: { tg: 'Воридшавии нав', ru: 'Новый вход в систему', en: 'New sign-in' },
    body: {
      tg: 'Воридшавии нав ба ҳисоби шумо қайд шуд',
      ru: 'Зафиксирован новый вход в ваш аккаунт',
      en: 'A new sign-in to your account was recorded',
    },
  },
  'security.alert': {
    title: { tg: 'Огоҳии амниятӣ', ru: 'Оповещение безопасности', en: 'Security alert' },
    body: {
      tg: 'Фаъолияти шубҳанок дар ҳисоби шумо ошкор шуд',
      ru: 'В вашем аккаунте обнаружена подозрительная активность',
      en: 'Suspicious activity was detected on your account',
    },
  },
  'account.welcome': {
    title: { tg: 'Хуш омадед', ru: 'Добро пожаловать', en: 'Welcome' },
    body: {
      tg: 'Ба Payvand хуш омадед!',
      ru: 'Добро пожаловать в Payvand!',
      en: 'Welcome to Payvand!',
    },
  },
};

function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return value === 'tg' || value === 'ru' || value === 'en';
}

export function parseAcceptLanguageHeader(header?: string | null): string | undefined {
  if (!header) return undefined;
  const firstTag = header.split(',')[0]?.trim().split(';')[0]?.trim();
  return firstTag ? firstTag.split('-')[0].toLowerCase() : undefined;
}

/** Same priority order as src/modules/i18n/i18n.service.ts resolveLanguage(). */
export function resolveLanguage(
  acceptLanguageHeader?: string | null,
  profileLanguage?: string | null,
): SupportedLanguage {
  const fromHeader = parseAcceptLanguageHeader(acceptLanguageHeader ?? undefined);
  if (isSupportedLanguage(fromHeader)) return fromHeader;
  if (isSupportedLanguage(profileLanguage ?? undefined)) return profileLanguage as SupportedLanguage;
  return DEFAULT_LANGUAGE;
}

export function renderTemplate(
  templateKey: string,
  lang: SupportedLanguage,
  params?: Record<string, unknown>,
): { title: string; body: string } | undefined {
  const template = NOTIFICATION_TEMPLATES[templateKey];
  if (!template) return undefined;
  return {
    title: interpolate(template.title[lang] ?? template.title[DEFAULT_LANGUAGE], params),
    body: interpolate(template.body[lang] ?? template.body[DEFAULT_LANGUAGE], params),
  };
}
