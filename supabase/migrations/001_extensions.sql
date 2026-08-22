-- 001_extensions.sql
-- Core extensions required by the Payvand backend.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive text (phone lookups)
create extension if not exists pg_trgm;    -- fuzzy search on names / titles
