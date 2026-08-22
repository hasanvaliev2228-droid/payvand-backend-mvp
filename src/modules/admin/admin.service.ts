/**
 * Admin module. Every function here relies on RLS's public.is_admin()
 * check (014_rls_policies.sql) as the actual authorization boundary: a
 * non-admin caller's queries simply return zero rows / are rejected by the
 * `with check` clauses, they are never granted extra visibility here.
 * These functions should additionally be called only from routes/Edge
 * Functions that independently re-verify profiles.role = 'admin' before
 * calling them (defense in depth — see docs/security.md).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import { listRows, updateRowById } from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import type { ListResult } from '../../types/api.types';
import { AppError } from '../../lib/errors';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type ServiceProviderRow = Database['public']['Tables']['service_providers']['Row'];
type AuditLogRow = Database['public']['Tables']['audit_logs']['Row'];

export async function listUsers(
  client: SupabaseClient<Database>,
  options: Omit<ListOptions, 'filters'> & { isActive?: boolean },
): Promise<ListResult<ProfileRow>> {
  const { isActive, ...rest } = options;
  return listRows<ProfileRow>(client, 'profiles', {
    ...rest,
    filters: { is_active: isActive },
  });
}

export async function setUserActive(
  client: SupabaseClient<Database>,
  userId: string,
  isActive: boolean,
): Promise<ProfileRow> {
  return updateRowById<ProfileRow>(client, 'profiles', userId, { is_active: isActive });
}

export async function listPendingProviders(
  client: SupabaseClient<Database>,
  options: Omit<ListOptions, 'filters'>,
): Promise<ListResult<ServiceProviderRow>> {
  return listRows<ServiceProviderRow>(client, 'service_providers', {
    ...options,
    filters: { status: 'pending' },
  });
}

export async function reviewProvider(
  client: SupabaseClient<Database>,
  providerId: string,
  status: 'active' | 'blocked',
): Promise<ServiceProviderRow> {
  return updateRowById<ServiceProviderRow>(client, 'service_providers', providerId, { status });
}

export async function listAuditLogs(
  client: SupabaseClient<Database>,
  options: Omit<ListOptions, 'filters'> & { entityType?: string },
): Promise<ListResult<AuditLogRow>> {
  const { entityType, ...rest } = options;
  return listRows<AuditLogRow>(client, 'audit_logs', {
    ...rest,
    filters: { entity_type: entityType },
  });
}

export interface AdminStatistics {
  totalUsers: number;
  activeUsers: number;
  pendingProviders: number;
  totalTransactions: number;
}

export async function getStatistics(client: SupabaseClient<Database>): Promise<AdminStatistics> {
  const [users, activeUsers, pendingProviders, transactions] = await Promise.all([
    client.from('profiles').select('id', { count: 'exact', head: true }),
    client.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    client
      .from('service_providers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    client.from('transactions').select('id', { count: 'exact', head: true }),
  ]);

  for (const r of [users, activeUsers, pendingProviders, transactions]) {
    if (r.error) throw AppError.internal(r.error.message);
  }

  return {
    totalUsers: users.count ?? 0,
    activeUsers: activeUsers.count ?? 0,
    pendingProviders: pendingProviders.count ?? 0,
    totalTransactions: transactions.count ?? 0,
  };
}
