import { openDB, type IDBPDatabase } from 'idb';

/**
 * This device's own copy of what the signed-in account last saw — the account, its labels, the views
 * it opened and the writes still waiting for the server — so the installed app opens and works
 * without a connection. IndexedDB, through `idb` (ISC).
 *
 * Everything here is a cache except the waiting writes: it is replaced by the server's answer at the
 * first chance, and wiped when the account signs out. A storage failure (a private window, a full
 * disk) is never an error for the app — it simply has no copy.
 */
const DATABASE = 'notka';
const STORE = 'local';

let database: Promise<IDBPDatabase> | null = null;

function open(): Promise<IDBPDatabase> {
  database ??= openDB(DATABASE, 1, {
    upgrade(db) {
      db.createObjectStore(STORE);
    }
  });
  return database;
}

export const localStore = {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      return (await (await open()).get(STORE, key)) as T | undefined;
    } catch {
      return undefined;
    }
  },

  /** Stores a plain copy: reactive state is a proxy, which IndexedDB cannot clone. */
  async set(key: string, value: unknown): Promise<void> {
    try {
      await (await open()).put(STORE, JSON.parse(JSON.stringify(value)), key);
    } catch {
      // No copy on this device; the app works on without one.
    }
  },

  /** Wipes everything but [keep]. */
  async clear(keep: readonly string[] = []): Promise<void> {
    try {
      const db = await open();
      for (const key of await db.getAllKeys(STORE)) {
        if (typeof key === 'string' && keep.includes(key)) continue;
        await db.delete(STORE, key);
      }
    } catch {
      // Nothing to wipe.
    }
  }
};
