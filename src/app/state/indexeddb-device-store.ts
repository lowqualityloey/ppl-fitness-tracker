import { type DeviceIdStore, DEVICE_ID_KEY } from './device-identity';
import { META_STORE, openTrackerDatabase } from './indexeddb-outbox-storage';

/**
 * The `meta`-store implementation of `DeviceIdStore`.
 *
 * Its own file, deliberately, even though it is ~25 lines: the outbox storage module
 * is the durability path and should not grow a second responsibility. It shares
 * `openTrackerDatabase()` rather than opening its own database, because the point of
 * putting identity in this database at all is that the queue and the identity have one
 * lifetime, not two that happen to be cleared together most of the time.
 */
export class IndexedDbDeviceIdStore implements DeviceIdStore {
  async get(key: string): Promise<string | null> {
    const db = await openTrackerDatabase();
    return new Promise<string | null>((resolve, reject) => {
      const transaction = db.transaction(META_STORE, 'readonly');
      const request = transaction.objectStore(META_STORE).get(key) as IDBRequest<string | undefined>;
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error('indexedDB meta get failed'));
    });
  }

  async set(key: string, value: string): Promise<void> {
    const db = await openTrackerDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(META_STORE, 'readwrite');
      transaction.objectStore(META_STORE).put(value, key);
      // Commit, not request-success: an id that was never written would mean every
      // later replay arrives from a "new" device.
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('indexedDB meta commit failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('indexedDB meta aborted'));
    });
  }

  /** Test/diagnostic helper: the value this store holds, if any. */
  async deviceId(): Promise<string | null> {
    return this.get(DEVICE_ID_KEY);
  }
}
