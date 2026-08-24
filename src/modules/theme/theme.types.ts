/**
 * Theme settings types. Deliberately NOT a new table: theme preference has
 * lived on `user_settings.theme` since 003_user_settings.sql
 * (`theme text not null default 'system' check (theme in ('light','dark','system'))`).
 * This module is a thin, dedicated wrapper around that existing column —
 * see theme.service.ts for why no new migration was added.
 */
import type { Database } from '../../types/database.types';

export type UserSettingsRow = Database['public']['Tables']['user_settings']['Row'];

/** The two themes this feature request asks for. 'system' remains a valid
 *  stored value (existing feature, not removed) but is intentionally not
 *  part of the type this module's schema accepts — see theme.schema.ts. */
export type Theme = 'light' | 'dark';
