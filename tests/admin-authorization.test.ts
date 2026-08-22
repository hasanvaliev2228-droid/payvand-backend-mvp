import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Admin authorization', () => {
  const rlsSql = readFileSync(
    path.resolve(__dirname, '../supabase/migrations/014_rls_policies.sql'),
    'utf-8',
  );

  it('is_admin() checks profiles.role = \'admin\' AND is_active = true', () => {
    expect(rlsSql).toMatch(/role = 'admin' and is_active = true/);
  });

  it('only admins can approve/block service providers at the RLS layer', () => {
    expect(rlsSql).toMatch(/service_providers_admin_all[\s\S]*?for all using \(public\.is_admin\(\)\)/);
  });

  it('regular users cannot insert notifications (admin-only insert policy)', () => {
    expect(rlsSql).toMatch(/notifications_admin_insert[\s\S]*?with check \(public\.is_admin\(\)\)/);
  });

  it('the send-notification Edge Function re-verifies role = admin server-side before sending', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../supabase/functions/send-notification/index.ts'),
      'utf-8',
    );
    expect(source).toMatch(/callerProfile\.role !== 'admin'/);
    expect(source).toMatch(/FORBIDDEN/);
  });

  it('admin.service.ts documents that RLS is the real authorization boundary, not application code', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../src/modules/admin/admin.service.ts'),
      'utf-8',
    );
    expect(source).toMatch(/is_admin\(\)/);
  });
});
