import type {
  GetNotificationsOptions,
  UpdateNotificationsOptions,
} from '@backstage/plugin-notifications';
import type {
  Notification,
  NotificationSeverity,
} from '@backstage/plugin-notifications-common';
import type { SignalApi } from '@backstage/plugin-signals-react';
import type { JsonObject } from '@backstage/types';

/**
 * Fakes of the upstream notifications store, as the notifications API client
 * reads and marks it, and of the signals stream that announces its changes.
 * Times go over the wire as ISO strings, as the real backend sends them.
 *
 * Test-only. Kept beside the inbox so every test of the inbox's upstream rows
 * fakes the store the same way.
 */
export type FakeNotification = {
  id: string;
  title: string;
  description?: string;
  link?: string;
  severity?: NotificationSeverity;
  /** ms since the epoch */
  created: number;
  /** ms since the epoch: sent again for the same scope. */
  updated?: number;
  read?: boolean;
};

function toWire(notification: FakeNotification): Notification {
  return {
    id: notification.id,
    user: 'user:default/alex',
    origin: 'plugin:scaffolder',
    created: new Date(notification.created).toISOString(),
    ...(notification.updated === undefined
      ? {}
      : { updated: new Date(notification.updated).toISOString() }),
    ...(notification.read
      ? { read: new Date(notification.created).toISOString() }
      : {}),
    payload: {
      title: notification.title,
      ...(notification.description
        ? { description: notification.description }
        : {}),
      ...(notification.link ? { link: notification.link } : {}),
      severity: notification.severity ?? 'normal',
    },
  } as unknown as Notification;
}

export function createFakeUpstream() {
  let store: FakeNotification[] = [];
  let failing = false;
  const listeners = new Map<string, Set<(message: JsonObject) => void>>();

  const notificationsApi = {
    getNotifications: jest.fn(async (options?: GetNotificationsOptions) => {
      if (failing) {
        throw new Error('Request failed with 503 Service Unavailable');
      }
      let listed = [...store].sort((a, b) => b.created - a.created);
      if (options?.read !== undefined) {
        listed = listed.filter(n => Boolean(n.read) === options.read);
      }
      if (options?.limit !== undefined) {
        listed = listed.slice(0, options.limit);
      }
      return { notifications: listed.map(toWire), totalCount: store.length };
    }),
    updateNotifications: jest.fn(
      async ({ ids, read }: UpdateNotificationsOptions) => {
        store = store.map(n =>
          ids.includes(n.id) && read !== undefined ? { ...n, read } : n,
        );
        return store.filter(n => ids.includes(n.id)).map(toWire);
      },
    ),
  };

  const signalApi: SignalApi & { subscribe: jest.Mock } = {
    subscribe: jest.fn(
      (channel: string, onMessage: (message: JsonObject) => void) => {
        const set = listeners.get(channel) ?? new Set();
        set.add(onMessage);
        listeners.set(channel, set);
        return { unsubscribe: () => set.delete(onMessage) };
      },
    ) as any,
  };

  return {
    notificationsApi,
    signalApi,
    /** What the store holds, newest last; nothing is announced. */
    set(notifications: FakeNotification[]) {
      store = [...notifications];
    },
    /** Stores a notification, or replaces one with the same id. */
    put(notification: FakeNotification) {
      store = [...store.filter(n => n.id !== notification.id), notification];
    },
    /** Whether a read fails. */
    setFailing(next: boolean) {
      failing = next;
    },
    /** Whether the store holds `id` as read. */
    isRead(id: string) {
      return Boolean(store.find(n => n.id === id)?.read);
    },
    /** Announces on a signals channel, as the notifications backend does. */
    signal(channel: string, message: JsonObject) {
      listeners.get(channel)?.forEach(listener => listener(message));
    },
  };
}
