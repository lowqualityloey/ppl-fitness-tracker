'use client';

import { useEffect, useState } from 'react';

/**
 * M4-22 (#111): registers the offline-shell worker and surfaces its update flow — the
 * "reload-offers-new-version" half of ASSUMPTION-m4-004, as a user-visible affordance rather
 * than platform folklore.
 *
 * Production-only on purpose: the literal `process.env.NODE_ENV === 'production'` is inlined
 * by the bundler (same read idiom `src/instrumentation-client.ts` documents), so the dev
 * server never registers a worker — a stale SW over `next dev`'s hot-reloading chunks is a
 * support trap with no paying user on the other side, and the e2e venue is the production
 * build anyway. That is a *documented* posture, not a gap: the battery asserts offline
 * behavior against `npm run build && npm run start`, and the dev exemption is asserted nowhere it
 * could rot silently because there is nothing to rot — no worker, no cache, nothing to claim.
 *
 * Auth-agnostic: an anonymous visitor caching `/sign-in` is exactly what AC-3's offline
 * cold-start needs, and PD-2's sign-out purge bounds what any cached document costs.
 */
export function ShellRegistration() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }
    let cancelled = false;
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (cancelled) return;
        // A *waiting* worker means the deploy landed while this tab was open; with
        // skipWaiting:false it activates on the next load. `update()` on every mount makes
        // the byte-check immediate at navigation time instead of riding the 24 h poll.
        void registration.update();
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });
      })
      .catch(() => {
        // Registration failure degrades to "no offline shell", never to a broken page.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!updateReady) return null;
  return (
    <div
      role="status"
      data-testid="offline-shell-update"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm rounded-md border border-neutral-300 bg-white p-3 text-sm shadow"
    >
      A new version is ready.{' '}
      <button
        type="button"
        className="underline"
        onClick={() => window.location.reload()}
      >
        Reload to apply
      </button>
    </div>
  );
}
