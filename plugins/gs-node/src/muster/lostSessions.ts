/**
 * How many lost MCP sessions on one installation, within
 * {@link FREQUENT_LOST_SESSIONS_WINDOW_MS}, are reported as a warning: far
 * more than an idle TTL or a roll causes.
 */
export const FREQUENT_LOST_SESSIONS = 10;
export const FREQUENT_LOST_SESSIONS_WINDOW_MS = 10 * 60_000;

/**
 * Counts the MCP sessions muster installations lose, to tell the occasional
 * loss (an idle TTL, a roll; logged at `info`) from a gateway that drops
 * sessions on nearly every request, where each request quietly pays for a
 * second `initialize`.
 *
 * A session is counted once, by the MCP client that held it, however many
 * requests were in flight on it when it went. Counts are per installation and
 * shared by every `MusterMcpClient` of the backend: muster-backend has one per
 * installation, and each backend plugin that calls one muster server through
 * `MusterServerClient` has its own.
 */
export class LostSessionTracker {
  private readonly counted = new WeakSet<object>();
  private readonly installations = new Map<
    string,
    { times: number[]; lastWarning: number }
  >();

  /**
   * Notes that `client` lost its session on `installation` at `now`. True when
   * that makes {@link FREQUENT_LOST_SESSIONS} losses within the window and no
   * warning was due for the installation within the last window: the caller
   * warns.
   */
  note(installation: string, client: object, now: number): boolean {
    if (this.counted.has(client)) {
      return false;
    }
    this.counted.add(client);

    let state = this.installations.get(installation);
    if (!state) {
      state = { times: [], lastWarning: -Infinity };
      this.installations.set(installation, state);
    }
    state.times.push(now);
    if (state.times.length > FREQUENT_LOST_SESSIONS) {
      state.times.shift();
    }
    if (
      state.times.length === FREQUENT_LOST_SESSIONS &&
      now - state.times[0] < FREQUENT_LOST_SESSIONS_WINDOW_MS &&
      now - state.lastWarning >= FREQUENT_LOST_SESSIONS_WINDOW_MS
    ) {
      state.lastWarning = now;
      return true;
    }
    return false;
  }
}

/** The tracker every `MusterMcpClient` of the backend shares by default. */
export const sharedLostSessionTracker = new LostSessionTracker();
