/**
 * Public entry point for the payvand-backend-mvp package. Re-exports the
 * client-safe modules (never supabase-admin.ts) so the Flutter/React Native
 * app — or any other TypeScript consumer — can import a single package.
 */
export * from './config/env';
export * from './lib/errors';
export * from './lib/response';
export * from './lib/pagination';
export * from './lib/supabase-client';

export * as ProfileModule from './modules/profile/profile.service';
export * as CardsModule from './modules/cards/cards.service';
export * as QrModule from './modules/qr/qr.service';
export * as CategoriesModule from './modules/categories/categories.service';
export * as TransactionsModule from './modules/transactions/transactions.service';
export * as LoansModule from './modules/loans/loans.service';
export * as ContactsModule from './modules/contacts/contacts.service';
export * as ChatModule from './modules/chat/chat.service';
export * as DocumentsModule from './modules/documents/documents.service';
export * as CalendarModule from './modules/calendar/calendar.service';
export * as HealthModule from './modules/health/health.service';
export * as ServicesModule from './modules/services/services.service';
export * as NotificationsModule from './modules/notifications/notifications.service';
export * as OfflineSyncModule from './modules/offline-sync/offline-sync.service';
export * as AdminModule from './modules/admin/admin.service';
export * as AuthModule from './modules/auth/auth.service';
export * as NotesModule from './modules/notes/notes.service';
export * as EmployeesModule from './modules/employees/employees.service';
export * as I18nModule from './modules/i18n/i18n.service';
export * as OcrModule from './modules/ocr/ocr.service';
export * as ThemeModule from './modules/theme/theme.service';
export * from './modules/finance/finance-engine';
export * from './modules/finance/budget-engine';
export * from './modules/finance/finance.schema';
export * from './modules/providers/provider.types';
export * from './modules/ai/ai.types';
