import { useCallback, useMemo } from 'react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { storedSettingWriteClient, useStoredSetting } from './useStoredSetting';

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

const KEY = 'favoriteAgents';

type FavoriteChange = 'added' | 'removed';

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

function readFavorites(value: unknown): FavoriteAgent[] {
  return Array.isArray(value) ? value.filter(isFavoriteAgent) : [];
}

/**
 * The agents the user marked as favorites, persisted per user through the
 * StorageApi (bucket `agent-platform`, key `favoriteAgents`). With the app's
 * `UserSettingsStorage` override that means the user-settings backend DB, so
 * favorites roam across browsers and devices; under the default WebStorage
 * (tests, signed-out) the same code persists to localStorage.
 *
 * Every mounted instance subscribes to the bucket's `observe$`, so a favorite
 * toggled in one component updates every other one without a reload. A toggle
 * is applied to the latest stored list (`useStoredSetting`), so toggles in
 * quick succession all land, and reports `AgentPlatform.agentFavoriteChanged`.
 *
 * Returns the same shape as {@link usePinnedSessions} so the two "starred
 * things" surfaces can share rendering code. Ids are the composite
 * `${installation}/${namespace}/${name}` that `AgentRow.id` already is.
 */
export function useFavoriteAgents() {
  const { snapshot, update } = useStoredSetting(KEY);

  const entries = useMemo(
    () => readFavorites(snapshot.presence === 'present' ? snapshot.value : []),
    [snapshot],
  );

  const pinnedIds = useMemo(() => entries.map(toFavoriteAgentId), [entries]);

  const isPinned = useCallback(
    (id: string) => pinnedIds.includes(id),
    [pinnedIds],
  );

  const { mutateAsync } = useTrackedMutation(
    {
      mutationFn: (id: string) =>
        update<FavoriteChange>(current => {
          const entry = fromFavoriteAgentId(id);
          if (!entry) {
            return undefined;
          }
          const favorites = readFavorites(current);
          return favorites.some(favorite => toFavoriteAgentId(favorite) === id)
            ? {
                value: favorites.filter(
                  favorite => toFavoriteAgentId(favorite) !== id,
                ),
                result: 'removed',
              }
            : { value: [...favorites, entry], result: 'added' };
        }),
      event: change =>
        change
          ? {
              name: 'AgentPlatform.agentFavoriteChanged',
              attributes: { change },
            }
          : null,
    },
    storedSettingWriteClient,
  );

  const togglePin = useCallback(
    async (id: string) => {
      await mutateAsync(id);
    },
    [mutateAsync],
  );

  return { pinnedIds, isPinned, togglePin };
}
