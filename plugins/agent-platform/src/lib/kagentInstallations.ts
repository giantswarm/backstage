/**
 * One installation the agent-platform-backend proxies kagent for, as
 * `GET /kagent/installations` reports it.
 *
 * `reachable` is what the backend learned from its **unauthenticated** probe
 * of the installation's kagent endpoint (no token, no user data): `true` when
 * anything answered, `false` when DNS, the connection, TLS or the 3 s budget
 * failed, `'unknown'` while no probe has settled yet. Only `false` is acted on
 * -- the per-user calls are skipped and the installation is labelled "not
 * reachable from this portal"; `'unknown'` behaves as everything did before the
 * probe existed.
 */
export type KagentInstallation = {
  name: string;
  reachable: boolean | 'unknown';
  /** The failure class, when `reachable` is `false`. Never names the host. */
  reason?: string;
};

function isReachability(value: unknown): value is boolean | 'unknown' {
  return value === true || value === false || value === 'unknown';
}

/**
 * One entry of the route's list, or `undefined` for anything that is not one.
 * Tolerates the previous shape (`{ name }` alone): an older backend, or a
 * cache entry written by one, reads as `'unknown'` rather than as reachable
 * or unreachable -- the probe never ran, so neither claim would be honest.
 */
export function toKagentInstallation(
  raw: unknown,
): KagentInstallation | undefined {
  if (typeof raw === 'string') {
    // The very first shape was a bare name; nothing writes it any more, but a
    // reader that is handed one still has an installation to name.
    return raw ? { name: raw, reachable: 'unknown' } : undefined;
  }
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const { name, reachable, reason } = raw as Record<string, unknown>;
  if (typeof name !== 'string' || !name) {
    return undefined;
  }
  const entry: KagentInstallation = {
    name,
    reachable: isReachability(reachable) ? reachable : 'unknown',
  };
  if (entry.reachable === false && typeof reason === 'string' && reason) {
    entry.reason = reason;
  }
  return entry;
}

/**
 * The list from the route's body, dropping whatever is not an installation.
 * A body without a list is an empty list, as before.
 */
export function parseKagentInstallations(body: unknown): KagentInstallation[] {
  const list = (body as { installations?: unknown } | null | undefined)
    ?.installations;
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map(toKagentInstallation)
    .filter((entry): entry is KagentInstallation => entry !== undefined);
}

/**
 * Whether `data` is a list this plugin wrote under
 * `kagentInstallationsQueryKey()`. The agent-platform react-query cache is
 * persisted across releases, so a rehydrated entry can hold whatever an older
 * portal put there; anything else than the current shape reads as "not
 * answered yet" and is refetched (the rule learned on backstage#2264).
 */
export function isKagentInstallationList(
  data: unknown,
): data is KagentInstallation[] {
  return (
    Array.isArray(data) &&
    data.every(
      entry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { name?: unknown }).name === 'string' &&
        isReachability((entry as { reachable?: unknown }).reachable),
    )
  );
}
