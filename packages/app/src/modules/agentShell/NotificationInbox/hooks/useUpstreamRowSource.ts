import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApiHolder } from '@backstage/frontend-plugin-api';
import {
  notificationsApiRef,
  type GetNotificationsResponse,
} from '@backstage/plugin-notifications';
import { signalApiRef } from '@backstage/plugin-signals-react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import type { InboxRowSource, UpstreamInboxRow } from '../types';
import { toUpstreamRows } from '../utils/upstreamRows';

/** The newest notifications the overlay lists. */
export const UPSTREAM_NOTIFICATIONS_LIMIT = 20;

/** The channel the notifications backend announces changes on. */
export const NOTIFICATIONS_SIGNAL_CHANNEL = 'notifications';

const QUERY_KEY = ['agentShell', 'notificationInbox', 'upstream'];

type MarkReadWrite = {
  /** The notifications to mark read; all the unread ones when left out. */
  ids?: string[];
  /** The person's own action, which the write reports. */
  reason?: 'opened' | 'markedAllRead';
};

export type UpstreamRowSource = InboxRowSource<UpstreamInboxRow> & {
  /** Reads the list again: the overlay opened. */
  refresh: () => void;
  /**
   * Marks one row read; `opened` reports that the person opened it from the
   * inbox.
   */
  markRead: (row: UpstreamInboxRow, opened: boolean) => Promise<void>;
  /**
   * Marks every unread notification read: the store has no call for it, so
   * the unread ones are read first and their ids marked, as the upstream UI
   * does. `report` says whether this write reports "Mark all read".
   */
  markAllRead: (report: boolean) => Promise<void>;
};

/**
 * The inbox's rows from the upstream notifications store: what other portal
 * features send the person through the standard notifications service, as
 * plain rows that keep the store's read state.
 *
 * The list is read when the inbox mounts, again on every change the
 * notifications backend announces (on the `notifications` signals channel; a
 * burst of announcements restarts one read rather than trusting each), when
 * the overlay opens and when the window regains the focus. A read that fails
 * keeps the rows of the last one that did not (none at first): the inbox's
 * other rows never wait on, or break with, the store. Without the
 * notifications API (a test app, or a portal without it) there are no rows.
 */
export function useUpstreamRowSource(): UpstreamRowSource {
  const apis = useApiHolder();
  const notificationsApi = apis.get(notificationsApiRef);
  const signalApi = apis.get(signalApiRef);

  // The inbox's own cache: one per mounted inbox, gone with it.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );
  useEffect(() => () => client.clear(), [client]);

  const query = useQuery(
    {
      queryKey: QUERY_KEY,
      queryFn: () =>
        notificationsApi!.getNotifications({
          limit: UPSTREAM_NOTIFICATIONS_LIMIT,
          sort: 'created',
          sortOrder: 'desc',
        }),
      enabled: Boolean(notificationsApi),
    },
    client,
  );

  // A read already on its way restarts, so the newest change is in it.
  const refresh = useCallback(() => {
    if (notificationsApi) {
      client.refetchQueries({ queryKey: QUERY_KEY }).catch(() => {});
    }
  }, [client, notificationsApi]);

  useEffect(() => {
    if (!notificationsApi || !signalApi) {
      return undefined;
    }
    const subscription = signalApi.subscribe(
      NOTIFICATIONS_SIGNAL_CHANNEL,
      refresh,
    );
    return () => subscription.unsubscribe();
  }, [notificationsApi, signalApi, refresh]);

  useEffect(() => {
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  const { mutateAsync } = useTrackedMutation(
    {
      mutationFn: async ({ ids }: MarkReadWrite) => {
        if (!notificationsApi) {
          return [];
        }
        const targets =
          ids ??
          (
            await notificationsApi.getNotifications({ read: false })
          ).notifications.map(notification => notification.id);
        if (targets.length > 0) {
          await notificationsApi.updateNotifications({
            ids: targets,
            read: true,
          });
        }
        return targets;
      },
      // Read here at once; the backend's announcement re-reads the list too.
      onSuccess: targets => {
        const read = new Set(targets);
        const now = new Date();
        client.setQueryData<GetNotificationsResponse>(QUERY_KEY, current =>
          current
            ? {
                ...current,
                notifications: current.notifications.map(notification =>
                  read.has(notification.id) && !notification.read
                    ? { ...notification, read: now }
                    : notification,
                ),
              }
            : current,
        );
      },
      event: (_, { reason }) => {
        if (reason === 'markedAllRead') {
          return {
            name: 'AgentPlatform.notificationsMarkedRead',
            attributes: {},
          };
        }
        if (reason === 'opened') {
          return {
            name: 'AgentPlatform.notificationOpened',
            attributes: { kind: 'plain' },
          };
        }
        return null;
      },
    },
    client,
  );

  const markRead = useCallback(
    async (row: UpstreamInboxRow, opened: boolean) => {
      await mutateAsync({
        ids: [row.notificationId],
        reason: opened ? 'opened' : undefined,
      });
    },
    [mutateAsync],
  );

  const markAllRead = useCallback(
    async (report: boolean) => {
      await mutateAsync({ reason: report ? 'markedAllRead' : undefined });
    },
    [mutateAsync],
  );

  const notifications = query.data?.notifications;
  const rows = useMemo(
    () => toUpstreamRows(notifications ?? []),
    [notifications],
  );
  const subjects = useMemo(() => new Set(rows.map(row => row.subject)), [rows]);

  return {
    rows,
    subjects,
    // A failed first read counts as read: nothing waits on the store.
    ready: !notificationsApi || !query.isPending,
    refresh,
    markRead,
    markAllRead,
  };
}
