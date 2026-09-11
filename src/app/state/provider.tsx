'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { SyncMutation, SyncResponseData } from '../../../lib/contracts/sync';
import { IndexedDBOutboxStorage } from './indexeddb-outbox-storage';
import { IndexedDbDeviceIdStore } from './indexeddb-device-store';
import { getDeviceId, DeviceIdUnavailableError } from './device-identity';
import type { VisibleRejection } from './reconcile';
import { Outbox } from './outbox';
import { SyncEngine, type SendOutcome, type SyncSnapshot } from './sync-engine';

/**
 * M3-06 (#63): the client-side wiring for the outbox. #62 built the mechanism and
 * stated that nothing was user-reachable; this is the reachability.
 *
 * The provider is where the three injected seams get real implementations: the
 * `OutboxStorage` is IndexedDB, the clock is the wall clock, and `send` is
 * `POST /api/sync`. It is also where the two lifetimes differ, and that is the part
 * worth reading carefully:
 *
 * - The **query client** lives per user, because a cache keyed `['sessions']` without a
 *   user id is a cross-account leak on a shared device (the card's own invariant).
 * - The **engine** lives per *session*, because an outbox is per-session by contract and
 *   `serverSeq` is per-session too. One engine for the whole app would send session B's
 *   mutations with session A's sequence number.
 *
 * Construction is deferred to an effect on purpose: `indexedDB` and `crypto` are
 * browser globals, and a client component still renders on the server in Next.js. The
 * provider therefore reports `ready` rather than pretending to be synchronous.
 */

/*
 * The `QueryClient` is deliberately NOT created here. One client component owns the
 * query cache and the sync engine together, because the engine's `refetch` must be able
 * to invalidate that cache — and if the cache lived in a parent provider, the only way
 * to reach it would be a context or a module singleton, both of which outlive a session
 * on a shared device. See `src/app/session/[id]/runner.tsx`.
 */

interface SessionSyncValue {
  userId: string;
  sessionId: string;
  /** Null while the browser's storage and device id are being resolved. */
  engine: SyncEngine | null;
  /**
   * True until the engine exists. Mutating controls are disabled rather than
   * silently buffering taps in memory: a tap accepted before IndexedDB is open is a
   * tap that can be lost on reload, which is the exact failure §4.3 forbids.
   */
  ready: boolean;
  unavailable: string | null;
}

const SessionSyncContext = createContext<SessionSyncValue | null>(null);

/** Query keys, namespaced by user. The card names this as a leak prevention, not hygiene. */
export function queryKey(userId: string, ...parts: ReadonlyArray<string | number>) {
  return ['user', userId, ...parts] as const;
}

export function SessionSyncProvider(props: {
  userId: string;
  sessionId: string;
  /** Called after any rejection so the shell can adopt authoritative state. */
  onRefetch: () => Promise<void>;
  /**
   * Poll only while there is something to poll *for*. A finished or archived session has
   * no server-side changes arriving, and §8.3's budget is shared with every other tab —
   * leaving a loop running on a completed screen spends requests on nothing, which is how
   * a polling design quietly becomes a 429.
   */
  enablePolling: boolean;
  children: React.ReactNode;
}) {
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  // The latest `onRefetch` in a ref, so the engine built once in the effect below does
  // not capture a stale closure — but assigned in an effect, never during render. The
  // first draft assigned inline and ESLint's `react-compiler` rule was right to call it:
  // a render must not write to anything that outlives it.
  const refetchRef = useRef(props.onRefetch);
  useEffect(() => {
    refetchRef.current = props.onRefetch;
  }, [props.onRefetch]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let deviceId: string;
      try {
        deviceId = await getDeviceId(new IndexedDbDeviceIdStore());
      } catch (error) {
        if (!cancelled && error instanceof DeviceIdUnavailableError) {
          setUnavailable('This browser cannot store a device id, so changes cannot sync.');
        }
        return;
      }
      if (cancelled) return;

      const created = new SyncEngine({
        outbox: new Outbox(props.sessionId, {
          storage: new IndexedDBOutboxStorage(),
          now: () => Date.now(),
          newId: () => crypto.randomUUID(),
        }),
        deviceId,
        now: () => Date.now(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        isVisible: () => document.visibilityState === 'visible',
        refetch: () => refetchRef.current(),
        send: async (request): Promise<SendOutcome> => {
          // `credentials` is same-origin default, so the session cookie rides along.
          // A *network* failure is retryable; an HTTP failure is judged by status.
          let response: Response;
          try {
            response = await fetch('/api/sync', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(request),
            });
          } catch {
            return { kind: 'retryable', reason: 'network' };
          }

          if (response.status === 401) {
            // Not retryable and not fatal-with-reason: the caller's redirect owns this.
            return { kind: 'fatal', reason: 'Not signed in. Sign in again to sync.' };
          }
          if (response.status === 429) {
            // Limiter: retryable, so it grows the backoff window instead of hammering.
            return { kind: 'retryable', reason: 'rate limited' };
          }
          if (!response.ok) {
            // The envelope's error code is what a user can act on. Reading it is the
            // difference between "sync failed" and "the server refused set 2".
            const body = (await response.json().catch(() => null)) as
              | { error?: { code?: string; message?: string } }
              | null;
            return {
              kind: response.status >= 500 ? 'retryable' : 'fatal',
              reason: body?.error?.message ?? `Sync failed (HTTP ${response.status}).`,
            };
          }

          const envelope = (await response.json()) as { data?: SyncResponseData };
          if (!envelope.data) return { kind: 'fatal', reason: 'Sync response had no data.' };
          return { kind: 'ok', data: envelope.data };
        },
      });
      setEngine(created);
    })();

    return () => {
      cancelled = true;
    };
  }, [props.sessionId, props.userId]);

  /*
   * Polling and connectivity, started here rather than in the runner because this is the
   * component that owns the engine's lifetime.
   *
   * The `online` listener is not a nicety. Without it, a device that regains signal has
   * to wait up to one visible poll interval for its queue to move, and the user is
   * standing in a gym looking at "3 waiting to sync" for four seconds after their bars
   * came back. The browser says the moment connectivity returns; draining then is free.
   */
  useEffect(() => {
    if (engine === null || !props.enablePolling) return;
    engine.startPolling();
    const onOnline = () => {
      // The browser falsified the window's premise ("unreachable right now");
      // clear it, then drain. Without the clear this call is a no-op inside a
      // window grown while offline — the mechanism behind the G-M3-4 tail
      // (sync-engine.ts `notifyConnectivityRestored`, audit entry 15).
      engine.notifyConnectivityRestored();
      void engine.drain();
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      engine.stopPolling();
    };
  }, [engine, props.enablePolling]);

  const value = useMemo<SessionSyncValue>(
    () => ({
      userId: props.userId,
      sessionId: props.sessionId,
      engine,
      ready: engine !== null && unavailable === null,
      unavailable,
    }),
    [engine, props.sessionId, props.userId, unavailable],
  );

  return <SessionSyncContext.Provider value={value}>{props.children}</SessionSyncContext.Provider>;
}

export function useSessionSync(): SessionSyncValue {
  const value = useContext(SessionSyncContext);
  if (value === null) throw new Error('useSessionSync must be used inside SessionSyncProvider');
  return value;
}

/**
 * The queue's visible state: how many taps are waiting, and what was refused.
 *
 * Push from `subscribe` plus one pull on mount, so a reload with a queue of five renders
 * "5 waiting to sync" immediately — RFC §4.3 Scenario 2, which is otherwise a test that
 * can only pass by waiting for a write that never comes.
 */
export function useSyncSnapshot(): SyncSnapshot & { ready: boolean } {
  const { engine, ready } = useSessionSync();
  const [snapshot, setSnapshot] = useState<SyncSnapshot>({
    pending: [],
    pendingCount: 0,
    rejections: [] as VisibleRejection[],
    lastFatalReason: null,
  });

  useEffect(() => {
    if (engine === null) return;
    let active = true;
    void engine.snapshot().then((current) => {
      // Without this flag, unmounting mid-flight would write into a dead component.
      if (active) setSnapshot(current);
    });
    const unsubscribe = engine.subscribe(setSnapshot);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [engine]);

  return { ...snapshot, ready };
}

/** Queue one mutation. Exposed so the runner's handlers stay readable. */
export async function queueMutation(engine: SyncEngine, mutation: SyncMutation): Promise<void> {
  await engine.mutate(mutation);
}
