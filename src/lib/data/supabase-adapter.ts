import type { Database, UserProfile } from "@/lib/domain/types";
import type {
  CollectionMap,
  CollectionName,
  Repository,
} from "./repository";

/**
 * V2 seam: Postgres/Supabase implementation of `Repository`.
 *
 * This file is intentionally a stub — V1 ships local-first with no keys
 * required. It exists so the shape of the migration is unambiguous:
 *
 *  1. Create one table per `CollectionName`, each with a `user_id uuid`
 *     column defaulting to `auth.uid()`.
 *  2. Enable RLS on every table with the same policy:
 *       using (auth.uid() = user_id) with check (auth.uid() = user_id)
 *     Financial rows must never be readable across users.
 *  3. Implement the methods below with `supabase.from(table)` calls, mapping
 *     camelCase fields to snake_case columns.
 *  4. Flip `getRepository()` in `local-adapter.ts` to return this class when
 *     `NEXT_PUBLIC_SUPABASE_URL` is present.
 *
 * Contexts become a child table (`transaction_contexts`) with a foreign key
 * to `transactions`, matching the domain model in spec §32; the adapter is
 * responsible for joining them back onto each `Transaction` on read.
 */

const NOT_IMPLEMENTED =
  "SupabaseRepository is a V2 stub. V1 runs on LocalRepository (IndexedDB).";

export class SupabaseRepository implements Repository {
  async load(): Promise<Database | null> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async saveProfile(_profile: UserProfile): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async put<K extends CollectionName>(
    _collection: K,
    _row: CollectionMap[K],
  ): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async putMany<K extends CollectionName>(
    _collection: K,
    _rows: CollectionMap[K][],
  ): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async remove(_collection: CollectionName, _id: string): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async removeMany(
    _collection: CollectionName,
    _ids: string[],
  ): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async replaceAll(_db: Database): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async clear(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
