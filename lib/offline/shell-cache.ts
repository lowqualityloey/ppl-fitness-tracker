/**
 * M4-22 (#111) — the sign-out half of PD-2's safety story.
 *
 * The offline shell caches navigation documents verbatim, and those documents carry the
 * signed-in user's data (the runner SSRs the session view — see the design spec). Cache
 * Storage may not outlive the session that authorised the render, so a successful sign-out
 * deletes every `shell-*` cache. `assets-*` survives deliberately: build chunks carry no
 * user data, and re-downloading them on the next sign-in would tax a network that has
 * nothing to do with the session change.
 */
export async function purgeOfflineShellDocuments(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const shellNames = (await caches.keys()).filter((name) => name.startsWith('shell-'));
  await Promise.all(shellNames.map((name) => caches.delete(name)));
}
