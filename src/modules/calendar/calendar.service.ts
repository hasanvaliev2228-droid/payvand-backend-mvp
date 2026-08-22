/**
 * Calendar module: tasks, reminders, events.
 * Security note: RLS (calendar_events_owner_all) scopes rows to user_id.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import {
  deleteRowById,
  getRowById,
  insertRow,
  listRows,
  updateRowById,
} from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import {
  createCalendarEventSchema,
  updateCalendarEventSchema,
  type CreateCalendarEventInput,
  type UpdateCalendarEventInput,
} from '../../schemas/calendar.schema';
import type { ListResult } from '../../types/api.types';

type CalendarEventRow = Database['public']['Tables']['calendar_events']['Row'];

export async function listMyEvents(
  client: SupabaseClient<Database>,
  userId: string,
  options: Omit<ListOptions, 'filters'> & { event_type?: string },
): Promise<ListResult<CalendarEventRow>> {
  const { event_type, ...rest } = options;
  return listRows<CalendarEventRow>(client, 'calendar_events', {
    ...rest,
    filters: { user_id: userId, event_type },
  });
}

export async function getMyEvent(
  client: SupabaseClient<Database>,
  id: string,
): Promise<CalendarEventRow> {
  return getRowById<CalendarEventRow>(client, 'calendar_events', id);
}

export async function createEvent(
  client: SupabaseClient<Database>,
  userId: string,
  input: CreateCalendarEventInput,
): Promise<CalendarEventRow> {
  const values = parseOrThrow(createCalendarEventSchema, input);
  return insertRow<CalendarEventRow>(client, 'calendar_events', { ...values, user_id: userId });
}

export async function updateEvent(
  client: SupabaseClient<Database>,
  id: string,
  input: UpdateCalendarEventInput,
): Promise<CalendarEventRow> {
  const values = parseOrThrow(updateCalendarEventSchema, input);
  return updateRowById<CalendarEventRow>(client, 'calendar_events', id, values);
}

export async function deleteEvent(client: SupabaseClient<Database>, id: string): Promise<void> {
  return deleteRowById(client, 'calendar_events', id);
}
