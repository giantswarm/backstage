import { useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import { kagentApiRef } from '../apis';
import {
  SESSION_SHARE_TTL_CHOICES,
  type CreatedSessionShare,
  type SessionShareTtl,
} from '../lib/sessionShares';
import { sessionSharesQueryKey } from './useSessionShares';

/** What the dialog asks for: a permission and one of the offered TTLs. */
export type NewSessionShare = {
  permission: 'read-only' | 'read-write';
  ttl: SessionShareTtl;
};

/**
 * Mint a share for one session.
 *
 * The result — the share and the **only copy of its token** — is kept on the
 * mutation (`created`) rather than in any query cache: react-query's query
 * cache is persisted to localStorage, and a credential must not be written to
 * disk. `reset` is how the dialog discards the token once it closes.
 *
 * The invalidation refetches like the rename's does: the dialog stays open
 * showing the list this write just extended, so the new share has to appear in
 * it, and awaiting inside `mutationFn` keeps `isPending` honest about that.
 */
export function useCreateSessionShare(installation: string, sessionId: string) {
  const kagentApi = useApi(kagentApiRef);
  const queryClient = useQueryClient();

  const mutation = useTrackedMutation({
    event: (_data: CreatedSessionShare, variables: NewSessionShare) => ({
      name: 'AgentPlatform.sessionShared' as const,
      attributes: { permission: variables.permission, ttl: variables.ttl },
    }),
    mutationFn: async (share: NewSessionShare) => {
      const choice = SESSION_SHARE_TTL_CHOICES.find(
        ttl => ttl.id === share.ttl,
      );
      const created = await kagentApi.createSessionShare(
        installation,
        sessionId,
        {
          permission: share.permission,
          // 'default' carries no seconds: the controller applies its own
          // maximum share lifetime.
          ...(choice?.seconds !== undefined && { ttlSeconds: choice.seconds }),
        },
      );

      await queryClient.invalidateQueries({
        queryKey: sessionSharesQueryKey(installation, sessionId),
      });

      return created;
    },
  });

  const { mutateAsync, reset } = mutation;

  const createShare = useCallback(
    async (share: NewSessionShare) => {
      await mutateAsync(share);
    },
    [mutateAsync],
  );

  return useMemo(
    () => ({
      createShare,
      /** The share just minted, with the only copy of its token. */
      created: mutation.data,
      isCreating: mutation.isPending,
      error: mutation.error as Error | null,
      /** Drops the token (and any error); call when the dialog closes. */
      reset,
    }),
    [createShare, mutation.data, mutation.isPending, mutation.error, reset],
  );
}

/** What {@link useCreateSessionShare} hands to the dialog. */
export type UseCreateSessionShareResult = ReturnType<
  typeof useCreateSessionShare
>;
