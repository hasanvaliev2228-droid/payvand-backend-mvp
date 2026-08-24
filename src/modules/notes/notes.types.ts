/**
 * Notes module types. Row/Insert/Update come straight from the generated
 * Database types (src/types/database.types.ts) — this file exists so the
 * rest of the module (and any consumer) imports a stable, module-scoped
 * name instead of reaching into `Database['public']['Tables']['notes']`
 * everywhere, matching the pattern used by the other CRUD modules.
 */
import type { Database } from '../../types/database.types';

export type NoteRow = Database['public']['Tables']['notes']['Row'];
export type NoteInsert = Database['public']['Tables']['notes']['Insert'];
export type NoteUpdate = Database['public']['Tables']['notes']['Update'];
