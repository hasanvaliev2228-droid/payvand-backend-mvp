/**
 * Service providers module (directory of local services).
 * Security note: RLS (service_providers_select_active_or_admin) means the
 * public only ever sees status = 'active' listings (plus their own pending
 * ones); only admins can approve/block (service_providers_admin_all).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import { getRowById, insertRow, listRows, updateRowById } from '../../lib/base-repository';
import type { ListOptions } from '../../lib/base-repository';
import { parseOrThrow } from '../../lib/validation';
import { createServiceProviderSchema, type CreateServiceProviderInput } from './services.schema';
import type { ListResult } from '../../types/api.types';

type ServiceProviderRow = Database['public']['Tables']['service_providers']['Row'];

export async function listServiceProviders(
  client: SupabaseClient<Database>,
  options: Omit<ListOptions, 'filters'> & { category?: string },
): Promise<ListResult<ServiceProviderRow>> {
  const { category, ...rest } = options;
  return listRows<ServiceProviderRow>(client, 'service_providers', {
    ...rest,
    filters: { category },
  });
}

export async function getServiceProvider(
  client: SupabaseClient<Database>,
  id: string,
): Promise<ServiceProviderRow> {
  return getRowById<ServiceProviderRow>(client, 'service_providers', id);
}

export async function registerServiceProvider(
  client: SupabaseClient<Database>,
  ownerId: string,
  input: CreateServiceProviderInput,
): Promise<ServiceProviderRow> {
  const values = parseOrThrow(createServiceProviderSchema, input);
  return insertRow<ServiceProviderRow>(client, 'service_providers', {
    ...values,
    owner_id: ownerId,
    status: 'pending',
  });
}

/** Admin-only in practice: RLS blocks a non-admin update outside their own pending row. */
export async function setServiceProviderStatus(
  client: SupabaseClient<Database>,
  id: string,
  status: 'pending' | 'active' | 'blocked',
): Promise<ServiceProviderRow> {
  return updateRowById<ServiceProviderRow>(client, 'service_providers', id, { status });
}
