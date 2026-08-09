import type {
  Account,
  ClassificationRule,
  CreditCardDetail,
  Category,
  Database,
  Goal,
  IncomeSource,
  Investment,
  Person,
  RecurringTransaction,
  Split,
  Transaction,
  UserProfile,
} from "@/lib/domain/types";

/**
 * The storage boundary.
 *
 * Nothing above this line knows whether rows live in IndexedDB or Postgres.
 * V1 ships `LocalRepository` (IndexedDB, zero setup). `SupabaseRepository`
 * implements the same interface against Postgres with row-level security —
 * swapping backends is a one-line change in `getRepository()`.
 *
 * Collections map 1:1 to future SQL tables, which is why mutations are
 * expressed per-row rather than as whole-snapshot writes.
 */

export interface CollectionMap {
  accounts: Account;
  creditCards: CreditCardDetail;
  categories: Category;
  transactions: Transaction;
  recurring: RecurringTransaction;
  goals: Goal;
  investments: Investment;
  incomeSources: IncomeSource;
  rules: ClassificationRule;
  people: Person;
  splits: Split;
}

export type CollectionName = keyof CollectionMap;

export const COLLECTION_NAMES: CollectionName[] = [
  "accounts",
  "creditCards",
  "categories",
  "transactions",
  "recurring",
  "goals",
  "investments",
  "incomeSources",
  "rules",
  "people",
  "splits",
];

export interface Repository {
  /** Returns the full dataset, or null if this device has never been seeded. */
  load(): Promise<Database | null>;

  saveProfile(profile: UserProfile): Promise<void>;

  put<K extends CollectionName>(
    collection: K,
    row: CollectionMap[K],
  ): Promise<void>;

  putMany<K extends CollectionName>(
    collection: K,
    rows: CollectionMap[K][],
  ): Promise<void>;

  remove(collection: CollectionName, id: string): Promise<void>;

  removeMany(collection: CollectionName, ids: string[]): Promise<void>;

  /** Wholesale replace — used by seeding, import and reset. */
  replaceAll(db: Database): Promise<void>;

  /** Drops everything this user owns. */
  clear(): Promise<void>;
}

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}
