-- seed.sql
-- Safe, non-sensitive seed data only: system transaction categories.
-- No demo users / auth.users rows are seeded here — Supabase manages
-- auth.users via GoTrue and seeding it directly is unsupported/unsafe.

insert into public.categories (id, user_id, name, type, icon, color, is_system)
values
  (gen_random_uuid(), null, 'Хӯрок', 'expense', 'utensils', '#F59E0B', true),
  (gen_random_uuid(), null, 'Нақлиёт', 'expense', 'car', '#3B82F6', true),
  (gen_random_uuid(), null, 'Коммуналӣ', 'expense', 'bolt', '#10B981', true),
  (gen_random_uuid(), null, 'Маош', 'income', 'wallet', '#22C55E', true),
  (gen_random_uuid(), null, 'Тандурустӣ', 'expense', 'heart-pulse', '#EF4444', true),
  (gen_random_uuid(), null, 'Маориф', 'expense', 'book', '#8B5CF6', true),
  (gen_random_uuid(), null, 'Фароғат', 'expense', 'gamepad', '#EC4899', true),
  (gen_random_uuid(), null, 'Дигар', 'expense', 'ellipsis', '#6B7280', true)
on conflict do nothing;
