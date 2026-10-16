import { useCallback, useEffect, useMemo } from 'react';
import {
  configApiRef,
  useApi,
  useApiHolder,
} from '@backstage/frontend-plugin-api';
import { notificationsApiRef } from '@backstage/plugin-notifications';
import type { Notification } from '@backstage/plugin-notifications-common';
import { signalApiRef } from '@backstage/plugin-signals-react';
import { useQuery } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import type { ReadableInboxRowSource, UpstreamInboxRow } from '../types';
import { appLocationOf, toUpstreamRows } from '../utils/upstreamRows';
import { inboxQueryClient } from './inboxQueryClient';

/** The newest notifications the overlay lists, read or not. */
export const UPSTREAM_NOTIFICATIONS_LIMIT = 20;

/**
 * The unread notifications the overlay lists besides the newest: one sent
 * again for an older scope keeps its first `created` (by which the store
 * sorts), so it can be unread again below the newest.
 */
export const UPSTREAM_UNREAD_LIMIT = 50;

/**
 * How long a read is trusted when the tab comes back into view: the signal
 * keeps the list current, so a quick switch away and back reads nothing.
 */
export const UPSTREAM_STALE_MS = 30_000;

/** The channel the notifications backend announces changes on. */
export const NOTIFICATIONS_SIGNAL_CHANNEL = 'notifications';

const QUERY_KEY = ['agentShell', 'notificationInbox', 'upstream'];

type MarkReadWrite = {
  /** The notifications to mark read; all the unread ones when left out. */
  ids?: string[];
  /** The person opened the row from the inbox. */
  opened?: boolean;
};

export type UpstreamRowSource = ReadableInboxRowSource<UpstreamInboxRow> & {
  /** Reads the list again: the overlay opened. */
  refresh: () => void;
};

/** The newest notifications and the unread ones, each once. */
function merge(...lists: Notification[][]): Notification[] {
  const byId = new Map<string, Notification>();
  lists.flat().forEach(notification => byId.set(notification.id, notification));
  return [...byId.values()];
}

/** A plain row is on screen on exactly the page it links to. */
function isPlainRowOnScreen(row: UpstreamInboxRow, pathname: string) {
  return !row.external && row.href?.split(/[?#]/)[0] === pathname;
}

/**
 * The inbox's rows from the upstream notifications store: what other portal
 * features send the person through the standard notifications service, as
 * plain rows that keep the store's read state.
 *
 * The list (the newest notifications and the unread ones) is read when the
 * inbox mounts, again on every change the notifications backend announces (on
 * the `notifications` signals channel; a burst of announcements restarts one
 * read rather than trusting each), when the overlay opens and when the tab
 * comes back into view after {@link UPSTREAM_STALE_MS}. A read that fails
 * keeps the rows of the last one that did not (none at first): the inbox's
 * other rows never wait on, or break with, the store. Without the
 * notifications API (a test app, or a portal without it) there are no rows.
 *
 * A plain row counts as seen on exactly the page it links to (its toast
 * followed, say), not below it: a producer's link may be a whole section the
 * person is in for other reasons.
 */
export function useUpstreamRowSource(): UpstreamRowSource {
  const apis = useApiHolder();
  const notificationsApi = apis.get(notificationsApiRef);
  const signalApi = apis.get(signalApiRef);
  const configApi = useApi(configApiRef);
  const app = useMemo(
    () => appLocationOf(configApi.getOptionalString('app.baseUrl')),
    [configApi],
  );

  // Mounted, the client reads again when the tab comes back into view.
  useEffect(() => {
    inboxQueryClient.mount();
    return () => inboxQueryClient.unmount();
  }, []);

  const query = useQuery(
    {
      queryKey: QUERY_KEY,
      queryFn: async () => {
        const [newest, unread] = await Promise.all([
          notificationsApi!.getNotifications({
            limit: UPSTREAM_NOTIFICATIONS_LIMIT,
            sort: 'created',
            sortOrder: 'desc',
          }),
          notificationsApi!.getNotifications({
            read: false,
            limit: UPSTREAM_UNREAD_LIMIT,
            sort: 'created',
            sortOrder: 'desc',
          }),
        ]);
        return merge(newest.notifications, unread.notifications);
      },
      enabled: Boolean(notificationsApi),
      staleTime: UPSTREAM_STALE_MS,
      refetchOnWindowFocus: true,
    },
    inboxQueryClient,
  );

  // A read already on its way restarts, so the newest change is in it.
  const refresh = useCallback(() => {
    if (notificationsApi) {
      inboxQueryClient.refetchQueries({ queryKey: QUERY_KEY }).catch(() => {});
    }
  }, [notificationsApi]);

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
      // A read on its way may have left before the write: it must not land
      // after it and turn the row unread again.
      onMutate: () => inboxQueryClient.cancelQueries({ queryKey: QUERY_KEY }),
      // Read here at once, then confirmed by a read that starts after the
      // write (and replaces any that started during it).
      onSuccess: targets => {
        const read = new Set(targets);
        const now = new Date();
        inboxQueryClient.setQueryData<Notification[]>(QUERY_KEY, current =>
          current?.map(notification =>
            read.has(notification.id) && !notification.read
              ? { ...notification, read: now }
              : notification,
          ),
        );
        inboxQueryClient
          .invalidateQueries({ queryKey: QUERY_KEY })
          .catch(() => {});
      },
      // "Mark all read" is reported by the inbox, once for every source.
      event: (_, { opened }) =>
        opened
          ? {
              name: 'AgentPlatform.notificationOpened',
              attributes: { kind: 'plain' },
            }
          : null,
    },
    inboxQueryClient,
  );

  const markRead = useCallback(
    async (row: UpstreamInboxRow, opened: boolean) => {
      await mutateAsync({ ids: [row.notificationId], opened });
    },
    [mutateAsync],
  );

  const markAllRead = useCallback(
    async () => (await mutateAsync({})).length > 0,
    [mutateAsync],
  );

  const notifications = query.data;
  const rows = useMemo(
    () => toUpstreamRows(notifications ?? [], app),
    [notifications, app],
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
    isOnScreen: isPlainRowOnScreen,
  };
}
