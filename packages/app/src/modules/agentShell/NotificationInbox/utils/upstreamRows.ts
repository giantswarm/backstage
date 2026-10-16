import type {
  Notification,
  NotificationSeverity,
} from '@backstage/plugin-notifications-common';
import type { UpstreamInboxRow } from '../types';

const SEVERITY_STATUS: Record<
  NotificationSeverity,
  UpstreamInboxRow['announce']['status']
> = {
  critical: 'danger',
  high: 'warning',
  normal: 'info',
  low: 'info',
};

/** The subject of a notification's rows: the notification. */
export function notificationSubject(id: string): string {
  return `notification:${id}`;
}

/** A time the store sends as an ISO string (typed as a `Date`), in ms. */
function timeOf(value: Date | string | undefined): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * Where a notification's link leads: a path inside the portal, or a whole URL
 * outside it. The store keeps a link as the producer sent it, a path (with or
 * without its leading slash, against the app's base URL) or a URL.
 */
export function notificationHref(
  link: string | undefined,
  origin: string = window.location.origin,
): { href: string; external: boolean } | undefined {
  const trimmed = link?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!/^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
    return {
      href: trimmed.startsWith('/') ? trimmed : `/${trimmed}`,
      external: false,
    };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return undefined;
  }
  return url.origin === origin
    ? { href: `${url.pathname}${url.search}${url.hash}`, external: false }
    : { href: url.href, external: true };
}

/**
 * The inbox rows of notifications from the upstream store: plain rows, with
 * the title, the description, the link and the age the producer sent, and the
 * store's read state.
 *
 * A notification sent again for the same scope keeps its id in the store and
 * turns unread again; its row's identity takes the time it was sent again, so
 * it is a new row, announced like one.
 */
export function toUpstreamRows(
  notifications: readonly Notification[],
): UpstreamInboxRow[] {
  return notifications.map(notification => {
    const { payload } = notification;
    const at = timeOf(notification.updated) ?? timeOf(notification.created);
    const link = notificationHref(payload.link);
    const description = payload.description?.trim() || undefined;
    return {
      id: `${notificationSubject(notification.id)}:${at ?? ''}`,
      subject: notificationSubject(notification.id),
      kind: 'plain',
      notificationId: notification.id,
      at,
      unread: !notification.read,
      title: payload.title,
      context: description,
      href: link?.href,
      external: link?.external,
      announce: {
        title: payload.title,
        description,
        status: SEVERITY_STATUS[payload.severity ?? 'normal'] ?? 'info',
        linkLabel: 'Open',
      },
    };
  });
}
