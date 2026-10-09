import { useCallback, useMemo } from 'react';
import { storageApiRef, useApi } from '@backstage/core-plugin-api';
import useObservable from 'react-use/esm/useObservable';

/**
 * One favorite agent, stored as a reference (not a copy) so it is re-resolved
 * against the live fleet wherever it is rendered — a favorite whose agent was
 * deleted simply stops matching. A `type` alias on purpose: aliases get the
 * implicit index signature that makes the array satisfy the StorageApi's
 * `JsonValue` constraint.
 */
export type FavoriteAgent = {
  installation: string;
  name: string;
  namespace: string;
};

const BUCKET = 'agent-platform';
const KEY = 'favoriteAgents';

/**
 * The composite id `AgentRow` already uses:
 * `${installation}/${namespace}/${name}` (see AgentsDataProvider helpers).
 */
function toFavoriteAgentId(entry: FavoriteAgent): string {
  return `${entry.installation}/${entry.namespace}/${entry.name}`;
}

function fromFavoriteAgentId(id: string): FavoriteAgent | undefined {
  // Installation and namespace names contain no slash; the name keeps any
  // later ones (self-hosted model agents carry ids like `.../qwen3:0.6b`).
  const first = id.indexOf('/');
  if (first <= 0) {
    return undefined;
  }
  const second = id.indexOf('/', first + 1);
  if (second === -1 || second === id.length - 1) {
    return undefined;
  }
  return {
    installation: id.slice(0, first),
    namespace: id.slice(first + 1, second),
    name: id.slice(second + 1),
  };
}

/**
 * Stored values come back from a shared bucket that older (or future) portal
 * versions also write, so every entry is checked rather than trusted. An empty
 * namespace is allowed — some agent rows carry one (`installation-1/ollama//…`).
 */
function isFavoriteAgent(value: unknown): value is FavoriteAgent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.installation === 'string' &&
    entry.installation.length > 0 &&
    typeof entry.namespace === 'string' &&
    typeof entry.name === 'string' &&
    entry.name.length > 0
  );
}

/**
 * The agents the user marked as favorites, persisted per user through the
 * StorageApi (bucket `agent-platform`, key `favoriteAgents`). With the app's
 * `UserSettingsStorage` override that means the user-settings backend DB, so
 * favorites roam across browsers and devices; under the default WebStorage
 * (tests, signed-out) the same code persists to localStorage.
 *
 * Every mounted instance subscribes to the bucket's `observe$`, so a favorite
 * toggled in one component updates every other one without a reload.
 *
 * Returns the same shape as {@link usePinnedSessions} so the two "starred
 * things" surfaces can share rendering code. Ids are the composite
 * `${installation}/${namespace}/${name}` that `AgentRow.id` already is.
 */
export function useFavoriteAgents() {
  const storageApi = useApi(storageApiRef);
  const bucket = useMemo(() => storageApi.forBucket(BUCKET), [storageApi]);

  // `observe$` emits on every change (and, for UserSettingsStorage, once with
  // the fetched value on subscription); the snapshot seeds the first render.
  const snapshot = useObservable(
    useMemo(() => bucket.observe$<FavoriteAgent[]>(KEY), [bucket]),
    useMemo(() => bucket.snapshot<FavoriteAgent[]>(KEY), [bucket]),
  );

  const entries = useMemo(
    () =>
      snapshot.presence === 'present' && Array.isArray(snapshot.value)
        ? snapshot.value.filter(isFavoriteAgent)
        : [],
    [snapshot],
  );

  const pinnedIds = useMemo(() => entries.map(toFavoriteAgentId), [entries]);

  const isPinned = useCallback(
    (id: string) => pinnedIds.includes(id),
    [pinnedIds],
  );

  const togglePin = useCallback(
    async (id: string) => {
      const entry = fromFavoriteAgentId(id);
      if (!entry) {
        return;
      }
      const next = pinnedIds.includes(id)
        ? entries.filter(favorite => toFavoriteAgentId(favorite) !== id)
        : [...entries, entry];
      await bucket.set(KEY, next);
    },
    [bucket, entries, pinnedIds],
  );

  return { pinnedIds, isPinned, togglePin };
}
