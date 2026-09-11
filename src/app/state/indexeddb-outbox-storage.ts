import type { OutboxStorage, StoredMutation } from './outbox';
import { OutboxQuotaExceededError } from './outbox';

/**
 * The IndexedDB half of the outbox storage seam (RFC §4.3: IndexedDB, never
 * `localStorage` — a synchronous string store cannot hold a structured queue
 * without a serialisation step that rewrites the whole queue on every tap, and it
 * has no quota story beyond throwing).
 *
 * Kept deliberately thin and untested-by-unit: every invariant worth asserting
 * lives in `Outbox`/`SyncEngine` above the seam, and a test that exercises this
 * file needs a real browser (the E2E suite in M3-06 owns that). What this file does
 * own is the *schema*: one object store, one index by `sessionId`, and a version
 * number that a future migration must bump rather than silently reinterpret.
 */

const DB_NAME = 'ppl-fitness-tracker';
export const OUTBOX_DB_VERSION = 1;

/** One store, keyed by `mutationId`; the `sessionId` index gives per-session FIFO. */
const STORE = 'outbox';

export class IndexedDBOutboxStorage implements OutboxStorage {
  /**
   * The connection is opened once and reused.
   *
   * Opening per call (the obvious first draft) leaks handles: a long workout's worth
   * of taps is a long workout's worth of unclosed connections, and a held connection
   * is exactly what makes another tab's version upgrade block forever. Memoising the
   * open promise is the standard fix, and the `versionchange` handler is what makes it
   * safe: when the browser asks for the connection back to upgrade it, the cached
   * promise is dropped so the next call reopens at the new version rather than handing
   * out a closed database.
   */
  private opened: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.opened !== null) return this.opened;

    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, OUTBOX_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'mutationId' });
          // `seq` inside the session is the order; the index makes `list()` a range
          // read rather than a full-store scan, which matters once a queue holds a
          // long workout's worth of taps.
          store.createIndex('bySessionSeq', ['sessionId', 'seq'], { unique: true });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          // Only clear the cache if it still points at *this* connection; otherwise a
          // stale event could evict a newer one opened in the meantime.
          if (this.opened === opening) this.opened = null;
        };
        resolve(db);
      };
      request.onerror = () =>
        reject(new OutboxQuotaExceededError(request.error ?? new Error('indexedDB.open failed')));
    });

    this.opened = opening;
    return opening;
  }

  /**
   * Runs one transaction and resolves **only when it has committed**.
   *
   * This is the durability guarantee, and the distinction is the whole point:
   * `request.onsuccess` fires when the operation succeeds, *before* the transaction is
   * flushed to disk. A `QuotaExceededError` surfaces on the transaction, not the
   * request. Resolving on the request would let `Outbox.enqueue` resolve — and a tap be
   * reported saved — for data the browser then refused to store, which is precisely the
   * silent-loss failure §4.3 exists to prevent. `oncomplete` is the only honest signal.
   */
  private async transact<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      let settled = false;

      transaction.oncomplete = () => {
        settled = true;
        resolve(request.result);
      };
      const fail = (label: string) => {
        if (settled) return;
        settled = true;
        reject(
          new OutboxQuotaExceededError(
            transaction.error ?? request.error ?? new Error(`indexedDB ${label}`),
          ),
        );
      };
      transaction.onerror = () => fail('commit');
      transaction.onabort = () => fail('abort');
    });
  }

  async put(mutation: StoredMutation): Promise<void> {
    await this.transact('readwrite', (store) => store.put(mutation));
  }

  async delete(mutationIds: readonly string[]): Promise<void> {
    if (mutationIds.length === 0) return;
    // One transaction for the whole id set: deleting them one at a time would let a
    // crash leave half a batch removed, which is the partial state `markApplied` is
    // supposed to make impossible.
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      for (const mutationId of mutationIds) store.delete(mutationId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new OutboxQuotaExceededError(transaction.error));
      transaction.onabort = () => reject(new OutboxQuotaExceededError(transaction.error));
    });
  }

  async list(sessionId: string): Promise<StoredMutation[]> {
    const db = await this.open();
    return new Promise<StoredMutation[]>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const index = transaction.objectStore(STORE).index('bySessionSeq');
      const range = IDBKeyRange.bound([sessionId, -Infinity], [sessionId, Infinity]);
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result as StoredMutation[]);
      request.onerror = () => reject(request.error ?? new Error('indexedDB getAll failed'));
    });
  }

  async updateAttempt(mutationId: string, attempt: number): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const get = store.get(mutationId);
      get.onsuccess = () => {
        const existing = get.result as StoredMutation | undefined;
        if (existing === undefined) return;
        store.put({ ...existing, attempt });
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new OutboxQuotaExceededError(transaction.error));
    });
  }
}
