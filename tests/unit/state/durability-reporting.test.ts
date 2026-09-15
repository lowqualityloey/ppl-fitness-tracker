/**
 * M4-06 (#95) — "the sync island's … IndexedDB failure modes reach the transport
 * (report, don't swallow)".
 *
 * Both cases assert the pair the card actually asks for: the defect arrives on the
 * channel **and** the caller's behaviour is unchanged. A report that replaced the
 * rejection would be worse than no report — §4.3's durable-before-acknowledged rule is
 * the reason `enqueue` refuses loudly in the first place, and #63's banner is the
 * reason `getDeviceId` still throws.
 *
 * The reporting is asserted at the origin of each typed failure rather than in the
 * component that catches it, so the same fact is reported once no matter how many
 * callers exist: `Outbox.enqueue` is the only place a storage refusal becomes a typed
 * error, and `getDeviceId` the only place a device identity becomes impossible.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { OutboxQuotaExceededError } from '../../../src/app/state/outbox';
import {
  DeviceIdUnavailableError,
  getDeviceId,
  type DeviceIdStore,
} from '../../../src/app/state/device-identity';
import { setErrorTransport, type ErrorEvent } from '../../../lib/errors/reporter';
import { DEVICE, SESSION, MemoryStorage, makeOutbox, setMutation } from './fixtures';

function recorder(): { events: ErrorEvent[]; transport: (e: ErrorEvent) => void } {
  const events: ErrorEvent[] = [];
  return { events, transport: (event) => events.push(event) };
}

afterEach(() => setErrorTransport(null));

describe('outbox storage refusal (AC 1, client half)', () => {
  it('reports the refusal with the queue position it cost, then rejects exactly as before', async () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);
    // The repo's own storage double, made to refuse at the one operation that matters:
    // re-implementing `OutboxStorage` inline here would let the fake drift from the
    // interface a `tsc` pass on the real adapter would otherwise catch.
    const storage = new MemoryStorage();
    storage.putImpl = async () => {
      throw new Error('QuotaExceededError: failed to execute put');
    };
    const { outbox } = makeOutbox(storage, SESSION);
    const mutation = setMutation(1, 0);

    await expect(outbox.enqueue(mutation)).rejects.toBeInstanceOf(OutboxQuotaExceededError);

    expect(events).toHaveLength(1);
    expect(events[0]!.plane).toBe('client');
    expect(events[0]!.kind).toBe('durability');
    expect(events[0]!.source).toBe('outbox:enqueue');
    // The three fields that make the event answerable: which session, which tap, which
    // queue position. A report without them is a count, not a defect.
    expect(events[0]!.attributes).toMatchObject({
      session_id: SESSION,
      mutation_id: mutation.mutationId,
      // `seq` 0: an empty queue's next slot. Asserted rather than assumed because the
      // number is the whole point of the attribute — it names the position in the queue
      // the tap lost, and `MemoryStorage.lastSeq` answers -1 when empty.
      seq: 0,
    });
    // The wrapped cause is what the owner needs (the browser's own reason), and it must
    // survive as the error the transport receives, not as prose in a message.
    expect((events[0]!.error as Error).message).toContain('QuotaExceededError');
    // Durability still refuses the tap rather than acknowledging it: the report is not a
    // substitute for §4.3's rule, it is a witness to it.
    expect(storage.rows).toEqual([]);
  });

  it('stays silent on a successful enqueue — durability is not a heartbeat', async () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);
    const storage = new MemoryStorage();
    const { outbox } = makeOutbox(storage, SESSION);

    await outbox.enqueue(setMutation(1, 0));

    expect(storage.rows).toHaveLength(1);
    expect(events).toEqual([]);
  });
});

describe('device identity becoming impossible (the other IndexedDB failure mode)', () => {
  const refusing: DeviceIdStore = {
    async get() {
      return null;
    },
    async set() {
      throw new Error('indexedDB.open denied by private browsing');
    },
  };

  it('reports a storage failure as durability and keeps throwing the typed error', async () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);

    await expect(getDeviceId(refusing, () => DEVICE)).rejects.toBeInstanceOf(
      DeviceIdUnavailableError,
    );

    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('durability');
    expect(events[0]!.source).toBe('device-id:store');
    expect(events[0]!.plane).toBe('client');
  });

  it('reports a junk generator as producer, because a full disk and a bad caller are different questions', async () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);

    await expect(getDeviceId(refusing, () => 'not-a-uuid')).rejects.toBeInstanceOf(
      DeviceIdUnavailableError,
    );

    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('producer');
    expect(events[0]!.source).toBe('device-id:mint');
    expect(events[0]!.message).toContain('not-a-uuid');
  });

  it('reports nothing when the identity reads back fine', async () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);
    const ok: DeviceIdStore = {
      async get() {
        return DEVICE;
      },
      async set() {},
    };

    await expect(getDeviceId(ok)).resolves.toBe(DEVICE);
    expect(events).toEqual([]);
  });
});
