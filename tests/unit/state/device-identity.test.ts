import { describe, expect, it } from 'vitest';
import {
  DEVICE_ID_KEY,
  DeviceIdUnavailableError,
  type DeviceIdStore,
  getDeviceId,
} from '../../../src/app/state/device-identity';

/**
 * M3-06 (#63) — device identity. Small module, and the failure it prevents is a
 * permanent one: an id that is regenerated on every reload makes each replay look like
 * a new device, and a corrupt id that is trusted fails schema validation on every
 * request forever while looking exactly like a connectivity problem.
 */

class MemoryStore implements DeviceIdStore {
  values = new Map<string, string>();
  writes = 0;
  failNextSet = false;

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    if (this.failNextSet) {
      this.failNextSet = false;
      throw new Error('QuotaExceededError');
    }
    this.writes += 1;
    this.values.set(key, value);
  }
}

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('getDeviceId', () => {
  it('mints once and reuses it forever', async () => {
    const store = new MemoryStore();
    let minted = 0;
    const newId = () => {
      minted += 1;
      return minted === 1 ? A : B;
    };

    expect(await getDeviceId(store, newId)).toBe(A);
    expect(await getDeviceId(store, newId)).toBe(A);
    expect(await getDeviceId(store, newId)).toBe(A);
    // One write total: a generator called per request would make every sync look like
    // it came from a different device.
    expect(minted).toBe(1);
    expect(store.writes).toBe(1);
  });

  it('replaces a stored value that is not a UUID instead of trusting it', async () => {
    const store = new MemoryStore();
    // The pre-contract case: something hand-written into the store, or left by an
    // experiment. Sending it would fail the `.strict()` UUID check on every request.
    store.values.set(DEVICE_ID_KEY, 'not-a-uuid');

    expect(await getDeviceId(store, () => A)).toBe(A);
    expect(store.values.get(DEVICE_ID_KEY)).toBe(A);
  });

  it('normalises case, because the contract compares UUID strings', async () => {
    const store = new MemoryStore();
    store.values.set(DEVICE_ID_KEY, A.toUpperCase());
    expect(await getDeviceId(store, () => B)).toBe(A);
  });

  it('fails loudly when the browser refuses to store the id', async () => {
    const store = new MemoryStore();
    store.failNextSet = true;
    // Typed, not a bare throw: a caller cannot queue mutations without an identity, so
    // "sync is unavailable here" is a real UI state rather than a retryable blip.
    await expect(getDeviceId(store, () => A)).rejects.toBeInstanceOf(DeviceIdUnavailableError);
  });

  it('refuses to persist a generated id that is not a UUID', async () => {
    const store = new MemoryStore();
    await expect(getDeviceId(store, () => 'oops')).rejects.toBeInstanceOf(DeviceIdUnavailableError);
    // Poisoning the store would turn one bad generator into permanent failure.
    expect(store.writes).toBe(0);
  });
});
