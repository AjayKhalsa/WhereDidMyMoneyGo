import { openDB, type IDBPDatabase } from "idb";
import type { Database, UserProfile } from "@/lib/domain/types";
import {
  COLLECTION_NAMES,
  RepositoryError,
  type CollectionMap,
  type CollectionName,
  type Repository,
} from "./repository";
import { SupabaseRepository } from "./supabase-adapter";
import { isSupabaseConfigured } from "./supabase-client";

/**
 * IndexedDB-backed repository.
 *
 * One object store per collection plus a `meta` store holding the singleton
 * profile. Everything is keyed by `id`, mirroring the eventual SQL layout,
 * so the Supabase adapter can be a mechanical translation.
 */

const DB_NAME = "wdmmg";
// Bumped to 2 to add the `people`/`splits` object stores — idb's `upgrade`
// callback only runs on a version change, so this must move whenever a new
// store is added or existing users silently never get it.
const DB_VERSION = 2;
const META_STORE = "meta";
const PROFILE_KEY = "profile";

type StoreName = CollectionName | typeof META_STORE;

let dbPromise: Promise<IDBPDatabase> | null = null;

function connect(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const name of COLLECTION_NAMES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: "id" });
          }
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE);
        }
      },
      blocking() {
        // Another tab is upgrading; let go so it can proceed.
        void dbPromise?.then((db) => db.close());
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

function wrap<T>(operation: string, work: () => Promise<T>): Promise<T> {
  return work().catch((cause) => {
    throw new RepositoryError(`Local storage failed during ${operation}`, cause);
  });
}

export class LocalRepository implements Repository {
  async load(): Promise<Database | null> {
    return wrap("load", async () => {
      const db = await connect();
      const profile = (await db.get(META_STORE, PROFILE_KEY)) as
        | UserProfile
        | undefined;
      if (!profile) return null;

      const tx = db.transaction(COLLECTION_NAMES as StoreName[], "readonly");
      const [
        accounts,
        creditCards,
        categories,
        transactions,
        recurring,
        goals,
        investments,
        incomeSources,
        rules,
        people,
        splits,
      ] = await Promise.all([
        tx.objectStore("accounts").getAll(),
        tx.objectStore("creditCards").getAll(),
        tx.objectStore("categories").getAll(),
        tx.objectStore("transactions").getAll(),
        tx.objectStore("recurring").getAll(),
        tx.objectStore("goals").getAll(),
        tx.objectStore("investments").getAll(),
        tx.objectStore("incomeSources").getAll(),
        tx.objectStore("rules").getAll(),
        tx.objectStore("people").getAll(),
        tx.objectStore("splits").getAll(),
      ]);
      await tx.done;

      return {
        profile,
        accounts,
        creditCards,
        categories,
        transactions,
        recurring,
        goals,
        investments,
        incomeSources,
        rules,
        people,
        splits,
      } as Database;
    });
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    return wrap("saveProfile", async () => {
      const db = await connect();
      await db.put(META_STORE, profile, PROFILE_KEY);
    });
  }

  async put<K extends CollectionName>(
    collection: K,
    row: CollectionMap[K],
  ): Promise<void> {
    return wrap(`put:${collection}`, async () => {
      const db = await connect();
      await db.put(collection, row);
    });
  }

  async putMany<K extends CollectionName>(
    collection: K,
    rows: CollectionMap[K][],
  ): Promise<void> {
    if (rows.length === 0) return;
    return wrap(`putMany:${collection}`, async () => {
      const db = await connect();
      const tx = db.transaction(collection, "readwrite");
      await Promise.all(rows.map((row) => tx.store.put(row)));
      await tx.done;
    });
  }

  async remove(collection: CollectionName, id: string): Promise<void> {
    return wrap(`remove:${collection}`, async () => {
      const db = await connect();
      await db.delete(collection, id);
    });
  }

  async removeMany(collection: CollectionName, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    return wrap(`removeMany:${collection}`, async () => {
      const db = await connect();
      const tx = db.transaction(collection, "readwrite");
      await Promise.all(ids.map((id) => tx.store.delete(id)));
      await tx.done;
    });
  }

  async replaceAll(data: Database): Promise<void> {
    return wrap("replaceAll", async () => {
      const db = await connect();
      const stores: StoreName[] = [...COLLECTION_NAMES, META_STORE];
      const tx = db.transaction(stores, "readwrite");
      await Promise.all(COLLECTION_NAMES.map((n) => tx.objectStore(n).clear()));
      await tx.objectStore(META_STORE).put(data.profile, PROFILE_KEY);
      for (const name of COLLECTION_NAMES) {
        const rows = data[name] as { id: string }[];
        const store = tx.objectStore(name);
        for (const row of rows) void store.put(row);
      }
      await tx.done;
    });
  }

  async clear(): Promise<void> {
    return wrap("clear", async () => {
      const db = await connect();
      const stores: StoreName[] = [...COLLECTION_NAMES, META_STORE];
      const tx = db.transaction(stores, "readwrite");
      await Promise.all(stores.map((n) => tx.objectStore(n).clear()));
      await tx.done;
    });
  }
}

/**
 * In-memory fallback.
 *
 * Server-side rendering and private-mode browsers that block IndexedDB both
 * need *something* that satisfies the interface. Data does not survive a
 * reload here, which is correct: there is nowhere to put it.
 */
export class MemoryRepository implements Repository {
  private data: Database | null = null;

  async load() {
    return this.data;
  }
  async saveProfile(profile: UserProfile) {
    if (this.data) this.data.profile = profile;
  }
  async put<K extends CollectionName>(collection: K, row: CollectionMap[K]) {
    if (!this.data) return;
    const rows = this.data[collection] as { id: string }[];
    const index = rows.findIndex((r) => r.id === row.id);
    if (index >= 0) rows[index] = row;
    else rows.push(row);
  }
  async putMany<K extends CollectionName>(
    collection: K,
    rows: CollectionMap[K][],
  ) {
    for (const row of rows) await this.put(collection, row);
  }
  async remove(collection: CollectionName, id: string) {
    if (!this.data) return;
    const rows = this.data[collection] as { id: string }[];
    const index = rows.findIndex((r) => r.id === id);
    if (index >= 0) rows.splice(index, 1);
  }
  async removeMany(collection: CollectionName, ids: string[]) {
    for (const id of ids) await this.remove(collection, id);
  }
  async replaceAll(db: Database) {
    this.data = structuredClone(db);
  }
  async clear() {
    this.data = null;
  }
}

let instance: Repository | null = null;

/**
 * Full switch-over, not a dual-write/offline cache — a sync-and-merge layer
 * is a real project on its own and isn't justified for a single-device
 * personal app. When Supabase is configured, `LocalRepository` is only ever
 * used directly (bypassing this function) by the local-to-cloud migration
 * panel, which needs both repositories at once.
 */
export function getRepository(): Repository {
  if (!instance) {
    if (isSupabaseConfigured && typeof window !== "undefined") {
      instance = new SupabaseRepository();
    } else {
      const canUseIDB =
        typeof window !== "undefined" && typeof indexedDB !== "undefined";
      instance = canUseIDB ? new LocalRepository() : new MemoryRepository();
    }
  }
  return instance;
}

/** Test seam — lets suites inject a MemoryRepository. */
export function setRepository(repo: Repository): void {
  instance = repo;
}
