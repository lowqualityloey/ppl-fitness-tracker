/**
 * The server's notion of "today", in the form `workout_sessions.local_date`
 * stores it.
 *
 * This is UTC, not the visitor's local day, and the honest reason is that the
 * server has no verified local date to use: `POST /api/sessions` does not accept
 * a `localDate` (`SessionStartRequestSchema` is `{ routineDayId, clientId }` and
 * `.strict()`), so a session is *always* filed under the server's UTC date. The
 * dashboard therefore has to read on the same clock it writes on, or a session
 * started at 18:00 in Los Angeles would vanish from the screen that just created
 * it. Extracting the expression into one function is what keeps those two halves
 * from drifting apart silently — the previous copy lived inline in the route.
 *
 * The real fix is a per-user timezone, and that belongs with preferences (#66)
 * and a contract change (the client knows its own date; the route refuses it
 * today). Until then this is a documented limitation, not an accident: for users
 * far enough from UTC the day rolls over mid-afternoon local.
 */
export function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Calendar-day arithmetic on `YYYY-MM-DD` strings, in UTC — the same clock
 * `currentUtcDate()` files sessions under, so a window drawn with this function
 * queries the edges it means to.
 */
export function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  shifted.setUTCDate(shifted.getUTCDate() + deltaDays);
  return shifted.toISOString().slice(0, 10);
}
