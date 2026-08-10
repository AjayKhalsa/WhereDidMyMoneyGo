import type { Database, UserProfile } from "@/lib/domain/types";
import { getRepository } from "./local-adapter";
import type { CollectionMap, CollectionName } from "./repository";
import { missingBuiltInCategories, remapLegacyCategories } from "./category-migration";

/**
 * A tiny observable store holding the whole dataset in memory.
 *
 * The dataset is small — a heavy user generates a few thousand transactions a
 * year — so keeping it resident lets every analytics function be a synchronous
 * pure transform over plain arrays. That is what makes editing a transaction
 * recalculate safe-to-spend, insights, category totals and the recap
 * instantly, with no refetch and no loading flash.
 *
 * Writes are optimistic: memory updates first and the UI repaints, then the
 * repository persists. If persistence fails we roll memory back and surface
 * the error, so what you see is never out of step with what was saved.
 */

export type StoreStatus = "idle" | "loading" | "ready" | "error";

export interface StoreState {
  status: StoreStatus;
  data: Database | null;
  error: string | null;
}

type Listener = () => void;

let state: StoreState = { status: "idle", data: null, error: null };
const listeners = new Set<Listener>();

function emit(next: StoreState) {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): StoreState {
  return state;
}

/** Stable empty snapshot so server rendering never touches IndexedDB. */
const SERVER_STATE: StoreState = {
  status: "loading",
  data: null,
  error: null,
};

export function getServerSnapshot(): StoreState {
  return SERVER_STATE;
}

let loadPromise: Promise<void> | null = null;

/**
 * Boots the store. Safe to call from many components — the work happens once.
 * `onEmpty` lets the caller decide what a first-run device gets (we seed demo
 * data so no screen is ever a blank dashboard).
 */
export function initStore(onEmpty: () => Database): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    emit({ status: "loading", data: null, error: null });
    const repo = getRepository();
    try {
      let data = await repo.load();
      if (!data) {
        data = onEmpty();
        await repo.replaceAll(data);
      } else {
        // Self-healing migration for data written under the old
        // multi-level category tree — no-ops after the first successful
        // run. Covers both backends since both funnel through here.
        //
        // Every write below is additive/targeted (put/putMany on just the
        // rows that changed) — deliberately never `replaceAll` here. A
        // silent background migration must never delete a live account's
        // data before writing it back; if a targeted write fails partway,
        // nothing already-good is lost, unlike a delete-then-reinsert that
        // is interrupted midway.
        const migrated = remapLegacyCategories(data);
        if (migrated.changed) {
          data = migrated.db;
          if (migrated.changedTransactions.length > 0) {
            await repo.putMany("transactions", migrated.changedTransactions);
          }
          if (migrated.changedRules.length > 0) {
            await repo.putMany("rules", migrated.changedRules);
          }
          if (migrated.changedRecurring.length > 0) {
            await repo.putMany("recurring", migrated.changedRecurring);
          }
          if (migrated.categoriesNeedRefresh) {
            await repo.putMany("categories", data.categories);
          }
        }

        // The common case: new built-in categories (e.g. the Type children)
        // added to the tree after this database was first seeded.
        const missing = missingBuiltInCategories(data.categories);
        if (missing.length > 0) {
          await repo.putMany("categories", missing);
          data = { ...data, categories: [...data.categories, ...missing] };
        }
      }
      emit({ status: "ready", data, error: null });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Could not open local storage";
      emit({ status: "error", data: null, error: message });
    }
  })();
  return loadPromise;
}

/** Discards cached boot state — used by reset/reseed so init can run again. */
export function resetStoreBoot(): void {
  loadPromise = null;
}

function requireData(): Database {
  if (!state.data) {
    throw new Error("Store accessed before it finished loading");
  }
  return state.data;
}

/**
 * Applies a pure transform to the in-memory database and persists the result.
 *
 * `persist` receives the *new* database so it can write only the rows that
 * actually changed rather than rewriting everything.
 */
async function commit(
  mutate: (db: Database) => Database,
  persist: (db: Database) => Promise<void>,
): Promise<void> {
  const previous = requireData();
  const next = mutate(previous);
  emit({ status: "ready", data: next, error: null });
  try {
    await persist(next);
  } catch (cause) {
    emit({
      status: "ready",
      data: previous,
      error:
        cause instanceof Error ? cause.message : "Could not save your change",
    });
    throw cause;
  }
}

/** Replaces or inserts one row by id, keeping array order stable. */
function upsert<T extends { id: string }>(rows: T[], row: T): T[] {
  const index = rows.findIndex((r) => r.id === row.id);
  if (index === -1) return [...rows, row];
  const next = rows.slice();
  next[index] = row;
  return next;
}

export async function putRow<K extends CollectionName>(
  collection: K,
  row: CollectionMap[K],
): Promise<void> {
  await commit(
    (db) => ({
      ...db,
      [collection]: upsert(db[collection] as { id: string }[], row),
    }),
    () => getRepository().put(collection, row),
  );
}

export async function putRows<K extends CollectionName>(
  collection: K,
  rows: CollectionMap[K][],
): Promise<void> {
  if (rows.length === 0) return;
  await commit(
    (db) => {
      let current = db[collection] as { id: string }[];
      for (const row of rows) current = upsert(current, row);
      return { ...db, [collection]: current };
    },
    () => getRepository().putMany(collection, rows),
  );
}

export async function removeRow(
  collection: CollectionName,
  id: string,
): Promise<void> {
  await commit(
    (db) => ({
      ...db,
      [collection]: (db[collection] as { id: string }[]).filter(
        (r) => r.id !== id,
      ),
    }),
    () => getRepository().remove(collection, id),
  );
}

export async function removeRows(
  collection: CollectionName,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  await commit(
    (db) => ({
      ...db,
      [collection]: (db[collection] as { id: string }[]).filter(
        (r) => !idSet.has(r.id),
      ),
    }),
    () => getRepository().removeMany(collection, ids),
  );
}

/**
 * Applies several collection changes as one atomic-looking update.
 * Used where a single user action touches multiple tables — e.g. adding an
 * expense also strengthens a classification rule.
 */
export interface BatchChange {
  puts?: Partial<{ [K in CollectionName]: CollectionMap[K][] }>;
  deletes?: Partial<{ [K in CollectionName]: string[] }>;
  profile?: UserProfile;
}

export async function applyBatch(change: BatchChange): Promise<void> {
  await commit(
    (db) => {
      const next: Database = { ...db };
      if (change.profile) next.profile = change.profile;
      for (const [name, rows] of Object.entries(change.puts ?? {})) {
        let current = next[name as CollectionName] as { id: string }[];
        for (const row of rows as { id: string }[]) current = upsert(current, row);
        (next as unknown as Record<string, unknown>)[name] = current;
      }
      for (const [name, ids] of Object.entries(change.deletes ?? {})) {
        const idSet = new Set(ids as string[]);
        const current = next[name as CollectionName] as { id: string }[];
        (next as unknown as Record<string, unknown>)[name] = current.filter(
          (r) => !idSet.has(r.id),
        );
      }
      return next;
    },
    async () => {
      const repo = getRepository();
      if (change.profile) await repo.saveProfile(change.profile);
      for (const [name, rows] of Object.entries(change.puts ?? {})) {
        await repo.putMany(
          name as CollectionName,
          rows as CollectionMap[CollectionName][],
        );
      }
      for (const [name, ids] of Object.entries(change.deletes ?? {})) {
        await repo.removeMany(name as CollectionName, ids as string[]);
      }
    },
  );
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await commit(
    (db) => ({ ...db, profile }),
    () => getRepository().saveProfile(profile),
  );
}

/** Wipes local data and re-seeds. Used by "reset demo data" in settings. */
export async function replaceDatabase(next: Database): Promise<void> {
  const repo = getRepository();
  await repo.replaceAll(next);
  emit({ status: "ready", data: next, error: null });
}

export function clearStoreError(): void {
  if (state.error) emit({ ...state, error: null });
}
