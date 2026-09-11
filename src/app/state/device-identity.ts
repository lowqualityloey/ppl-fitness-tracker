/**
 * M3-06 (#63): device identity, which `#62` deliberately left unowned.
 *
 * `SyncRequestSchema` requires a `deviceId` UUID, so something has to mint one and
 * keep it. That is a decision with a trap in it: RFC §4.3's rule is "`localStorage`
 * is never **the queue**", and a device id is not the queue — so the letter of the
 * rule would permit `localStorage`. This module chooses IndexedDB anyway, for two
 * reasons worth stating rather than assuming:
 *
 * 1. §8.5 records "the IndexedDB-over-`localStorage` choice" as a deliberate
 *    boundary, and durable client state that must survive a reload belongs on one
 *    side of it. A device id that *reverses* on a storage clear would make every
 *    replay look like a brand-new device.
 * 2. It lives in the same database as the outbox, so "cleared my offline data"
 *    clears both together. Splitting them across two storages with two lifetimes is
 *    how a client ends up replaying an old queue under a new identity.
 *
 * The id is *stable per browser profile*, not per user: it identifies a device, and
 * two accounts on one phone share it. Nothing user-derived may be stored here.
 */

/** The single key this store holds. Deliberately not configurable. */
export const DEVICE_ID_KEY = 'deviceId';

/**
 * The seam: one string in, one string out. Shaped this way so the *rules* (mint once,
 * reuse forever, never mint an empty value) are unit-testable without a browser,
 * matching the pattern `Outbox` uses for its storage.
 */
export interface DeviceIdStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export class DeviceIdUnavailableError extends Error {
  constructor(public readonly cause?: unknown) {
    super('This browser cannot store a device identifier, so sync cannot be performed.');
    this.name = 'DeviceIdUnavailableError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Return this device's id, creating it on first call.
 *
 * The stored value is re-validated on read rather than trusted. A corrupt or
 * non-UUID value (a hand-edited store from the pre-contract days, or bytes from an
 * older experiment) would otherwise be sent on every request and rejected by the
 * `.strict()` schema each time — a permanent, silent sync failure that looks like a
 * network problem. Rejected values are replaced, which is safe: the id scopes nothing
 * the user can see, and the server keys idempotency by `mutationId`, not device.
 */
export async function getDeviceId(
  store: DeviceIdStore,
  newId: () => string = () => crypto.randomUUID(),
): Promise<string> {
  const existing = await store.get(DEVICE_ID_KEY);
  if (existing !== null && UUID.test(existing)) {
    return existing.toLowerCase();
  }

  const minted = newId();
  if (!UUID.test(minted)) {
    // A caller-injected generator that returns junk would poison the store, so it
    // fails here rather than on the wire.
    throw new DeviceIdUnavailableError(new Error(`generated id is not a UUID: ${minted}`));
  }

  try {
    await store.set(DEVICE_ID_KEY, minted);
  } catch (error) {
    throw new DeviceIdUnavailableError(error);
  }
  return minted;
}
