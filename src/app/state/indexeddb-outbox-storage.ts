import type { OutboxStorage, StoredMutation } from './outbox';
import { OutboxQuotaExceededError } from './outbox';

/**
 * The IndexedDB half of the outbox storage seam (RFC §4.3: IndexedDB, never
 * `localStorage` — a synchronous string store cannot hold a structured queue without
 * a serialisation step that rewrites the whole queue on every tap, and it has no
 * quota story beyond throwing).
 *
 * Kept deliberately thin and untested-by-unit: every invariant worth asserting lives
 * in `Outbox`/`SyncEngine` above the seam, and a test that exercises this file needs a
 * real browser (M3-06's E2E specs own that). What this file does own is the *schema*:
 * the store set, the index, and a version number that a future migration must bump
 * rather than silently reinterpret.
 */

const DB_NAME = 'ppl-fitness-tracker';

/**
 * Bumped to 2 by `#63` for the `meta` store (device identity). The upgrade adds a
 * store; it does not reinterpret the old one — which is the entire reason a version
 * number exists: a v1 outbox must survive intact and mean the same thing afterwards.
 */
export const OUTBOX_DB_VERSION = 2;

/** Keyed by `mutationId`; the `bySessionSeq` index gives per-session FIFO. */
const STORE = 'outbox';

/** Key/value store for scalars that must share the outbox's lifetime (device id). */
export const META_STORE = 'meta';

/**
 * Opens — and on first call creates — the app's single IndexedDB database.
 *
 * Exported because device identity lives in the *same* database on purpose: one
 * "clear my offline data" action then clears the queue and the device id together,
 * instead of leaving a replay of last week's mutations pointing at a freshly minted
 * device.
 *
 * The connection is opened once and reused. Opening per call (the obvious first draft)
 * leaks handles: a long workout's worth of taps is a long workout's worth of unclosed
 * connections, and a held connection is exactly what makes another tab's version
 * upgrade block forever. The `versionchange` handler is what makes memoising safe:
 * when the browser asks for the connection back, the cached promise is dropped so the
 * next call reopens at the new version rather than handing out a closed database.
 */
let opened: Promise<IDBDatabase> | null = null;

export function openTrackerDatabase(): Promise<IDBDatabase> {
  if (opened !== null) return opened;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, OUTBOX_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      // Both guarded: on a fresh install this creates both stores at version 2, and on
      // an upgrade from 1 it adds only `meta` and leaves the outbox rows alone.
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'mutationId' });
        // `seq` inside the session is the order; the index makes `list()` a range read
        // rather than a full-store scan, which matters once a queue holds a long
        // workout's worth of taps.
        store.createIndex('bySessionSeq', ['sessionId', 'seq'], { unique: true });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        // Only clear the cache if it still points at *this* connection; otherwise a
        // stale event could evict a newer one opened in the meantime.
        if (opened === opening) opened = null;
      };
      resolve(db);
    };
    request.onerror = () =>
      reject(new OutboxQuotaExceededError(request.error ?? new Error('indexedDB.open failed')));
  });

  opened = opening;
  return opening;
}

/**
 * Runs one transaction and settles only once it has **committed**.
 *
 * This is the durability guarantee, and the distinction is the whole point:
 * `request.onsuccess` fires when the operation succeeds, *before* the transaction is
 * flushed, and a `QuotaExceededError` surfaces on the transaction rather than the
 * request. Resolving on the request would let `Outbox.enqueue` resolve — and a tap be
 * reported saved — for data the browser then refused to store, which is precisely the
 * silent-loss failure §4.3 exists to prevent. `oncomplete` is the honest signal.
 *
 * Two helpers rather than one generic: `IDBRequest<T>` is invariant in `T` (its
 * `onsuccess` is typed with `this: IDBRequest<T>`), so a single "widen the request"
 * signature cannot accept both `put`'s `IDBValidKey` and `getAll`'s array. Attempting
 * it is what the previous draft of this file did, and `tsc` was right to refuse.
 */
function commitTransaction(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    let settled = false;
    transaction.oncomplete = () => {
      settled = true;
      resolve();
    };
    const fail = (label: string) => {
      if (settled) return;
      settled = true;
      reject(new OutboxQuotaExceededError(transaction.error ?? new Error(`indexedDB ${label}`)));
    };
    transaction.onerror = () => fail('commit');
    transaction.onabort = () => fail('abort');
    run(transaction.objectStore(storeName));
  });
}

/** As above, but reads the request's result after the transaction has settled. */
function readTransaction<T>(
  db: IDBDatabase,
  storeName: string,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const request = run(transaction.objectStore(storeName));
    let settled = false;
    transaction.oncomplete = () => {
      settled = true;
      resolve(request.result);
    };
    const fail = (label: string) => {
      if (settled) return;
      settled = true;
      reject(new OutboxQuotaExceededError(transaction.error ?? request.error ?? new Error(`indexedDB ${label}`)));
    };
    transaction.onerror = () => fail('read');
    transaction.onabort = () => fail('abort');
  });
}

export class IndexedDBOutboxStorage implements OutboxStorage {
  async put(mutation: StoredMutation): Promise<void> {
    const db = await openTrackerDatabase();
    await commitTransaction(db, STORE, 'readwrite', (store) => {
      store.put(mutation);
    });
  }

  async delete(mutationIds: readonly string[]): Promise<void> {
    if (mutationIds.length === 0) return;
    // One transaction for the whole id set: deleting them one at a time would let a
    // crash leave half a batch removed, which is the partial state `markApplied` is
    // supposed to make impossible.
    const db = await openTrackerDatabase();
    await commitTransaction(db, STORE, 'readwrite', (store) => {
      for (const mutationId of mutationIds) store.delete(mutationId);
    });
  }

  async list(sessionId: string): Promise<StoredMutation[]> {
    const db = await openTrackerDatabase();
    return readTransaction<StoredMutation[]>(db, STORE, (store) => {
      const range = IDBKeyRange.bound([sessionId, -Infinity], [sessionId, Infinity]);
      return store.index('bySessionSeq').getAll(range) as IDBRequest<StoredMutation[]>;
    });
  }

  async updateAttempt(mutationId: string, attempt: number): Promise<void> {
    const db = await openTrackerDatabase();
    await commitTransaction(db, STORE, 'readwrite', (store) => {
      // Read-modify-write inside one transaction, so the row's `seq`, `payload`, and
      // `mutationId` cannot be observed half-updated, and a missing row is a no-op
      // rather than the creation of a `payload`-less record.
      const get = store.get(mutationId) as IDBRequest<StoredMutation | undefined>;
      get.onsuccess = () => {
        const existing = get.result;
        if (existing !== undefined) store.put({ ...existing, attempt });
      };
    });
  }
}
