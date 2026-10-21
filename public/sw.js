/**
 * M4-22 (#111) — the offline app shell. Hand-written per DECISION-m4-003 (no Workbox/Serwist:
 * their value is route-caching strategies this app has explicitly forbidden itself from having
 * for `/api`). The build step (`scripts/build-sw-manifest.ts`, chained after `next build`)
 * stamps `BUILD_VERSION` below and writes `sw-manifest.json`; byte-diff on THIS file is the
 * only update trigger the platform gives a hand-written worker, so the stamp is what makes a
 * new deploy discoverable at all.
 *
 * Update policy — the documented flow the card demands ("decide and document which"):
 *   PRECACHE + UPDATE, not stale-while-revalidate. A new deploy changes these bytes → the
 *   browser byte-checks `/sw.js` → the new worker installs but WAITS (`skipWaiting: false`,
 *   ASSUMPTION-m4-004: a mid-workout asset swap is the exact state M3's outbox contract
 *   protects). It activates on the next natural reload/reopen; the page surfaces a "reload to
 *   apply" chip (`src/components/shell-registration.tsx`). Reload-offers-new-version — never a
 *   forced reload, never `clients.claim()` (claiming would hijack already-open tabs).
 *
 * Fetch policy, four classes, evaluated in order:
 *   1. NEVER touched: non-GET, cross-origin, anything under `/api/` or `/auth/`. Pure
 *      `fetch(request)` pass-through — errors propagate unchanged. This is the load-bearing
 *      half of "the server remains sole truth for data": the worker is invisible to every
 *      JSON exchange, which is why `sla.spec.ts`'s offline drain runs against it unmodified.
 *   2. Navigations: network-first, storing the successful Response VERBATIM (headers ride
 *      along, so a cached document's own CSP header still matches the nonce stamped into its
 *      inline scripts — a reconstructed response would not). On network failure serve the
 *      stored copy; on no stored copy rethrow (the browser error page is the honest answer
 *      for a route never visited — AC-3's cold-start case is `/sign-in`, which the visit
 *      itself stores).
 *   3. /_next/static/**: cache-first against the precache; content-hashed URLs are immutable.
 *   4. Everything else: pass-through, uncached.
 *
 * Cache generations: `shell-<v>` / `assets-<v>` per stamped version. On activate the worker
 * deletes its own names except the current generation and the most recently created other
 * one — keep-previous exists because a stored navigation document references the chunk URLs
 * of ITS build; evicting that pair strands the first offline reload after a deploy (the AC-2
 * stale-code landmine). Two deploys without an online visit in between degrades to the error
 * page: the accepted residual of ASSUMPTION-m4-004.
 *
 * Everything above is browser behavior and is verified ONLY in tests/e2e/offline-shell.spec.ts
 * (design spec PD-4): a classic worker cannot import Node modules, and a unit test against a
 * second copy of this logic would grade a double.
 */

const BUILD_VERSION = "6087986a78cc";

const MANIFEST_URL = "/sw-manifest.json";
const SHELL_PREFIX = "shell-";
const ASSETS_PREFIX = "assets-";

self.addEventListener("install", (event) => {
  event.waitUntil(
    fetch(MANIFEST_URL, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`manifest fetch failed: ${response.status}`);
        return response.json();
      })
      .then((manifest) => {
        if (manifest.version !== BUILD_VERSION) {
          // The two build outputs disagree — refuse to install a half-known shell rather
          // than precache a manifest under a version that is not the one this file stamped.
          throw new Error(`manifest version ${manifest.version} != stamped ${BUILD_VERSION}`);
        }
        return caches.open(ASSETS_PREFIX + BUILD_VERSION).then((cache) =>
          // c.add over c.addLast: a single missing chunk fails the install loudly and the
          // waiting worker is discarded — the old one keeps serving; a silently partial
          // shell is the same landmine with extra steps.
          Promise.all(manifest.urls.map((url) => cache.add(url))),
        );
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      const ours = names.filter(
        (n) => n.startsWith(SHELL_PREFIX) || n.startsWith(ASSETS_PREFIX),
      );
      const versionOf = (name) =>
        name.startsWith(SHELL_PREFIX)
          ? name.slice(SHELL_PREFIX.length)
          : name.slice(ASSETS_PREFIX.length);
      // "Most recent other" = last non-current entry in CacheStorage enumeration order
      // (creation order ≈ deploy order). Version strings are content-hash digests —
      // comparing them is meaningless, and a rollback must not evict what it rolled from.
      const others = ours.map(versionOf).filter((v) => v !== BUILD_VERSION);
      const previous = others.length > 0 ? others[others.length - 1] : null;
      return Promise.all(
        ours
          .filter((name) => {
            const v = versionOf(name);
            return v !== BUILD_VERSION && v !== previous;
          })
          .map((name) => caches.delete(name)),
      );
    }),
    // NO clients.claim() here — see the header. A newly active worker taking over open tabs
    // mid-session is the forbidden swap, one notch worse than skipWaiting: true.
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // never intercept non-GETs at all (POST /api/sync etc.)

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstDocument(request));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }
  // Class 4: public images and the like — network, no writes.
});

async function networkFirstDocument(request) {
  const cache = await caches.open(SHELL_PREFIX + BUILD_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      // Verbatim store, clone because the body is a one-use stream. cache.put can throw on
      // some Vary combinations; a document that cannot be stored must still render, so the
      // storage failure is logged against the seam and the response sails through.
      cache.put(request, response.clone()).catch((error) => {
        console.warn("[sw] document not storable:", request.url, error);
      });
    }
    return response;
  } catch (networkError) {
    const stored = await cache.match(request);
    if (stored) return stored;
    throw networkError;
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(ASSETS_PREFIX + BUILD_VERSION);
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}
