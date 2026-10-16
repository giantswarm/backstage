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

/** Where the portal is served: its origin and the path the app runs under. */
export type AppLocation = {
  origin: string;
  /** The path of `app.baseUrl`, without its trailing slash ('' at the root). */
  basePath: string;
};

/** The app's location from its `app.baseUrl` (the page's origin without one). */
export function appLocationOf(baseUrl: string | undefined): AppLocation {
  try {
    const url = new URL(baseUrl ?? window.location.origin);
    return { origin: url.origin, basePath: url.pathname.replace(/\/+$/, '') };
  } catch {
    return { origin: window.location.origin, basePath: '' };
  }
}

/**
 * Where a notification's link leads: a path inside the app (relative to where
 * the app is served, as the router takes it), or a whole URL outside it. The
 * store keeps a link as the producer sent it: a path (with or without its
 * leading slash, against the app's base URL) or a URL. Each is resolved as a
 * URL first, so a protocol-relative `//other.example` is outside too.
 */
export function notificationHref(
  link: string | undefined,
  app: AppLocation,
): { href: string; external: boolean } | undefined {
  const trimmed = link?.trim();
  if (!trimmed) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(
      trimmed.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(trimmed)
        ? trimmed
        : `/${trimmed}`,
      app.origin,
    );
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return undefined;
  }
  if (url.origin !== app.origin) {
    return { href: url.href, external: true };
  }
  // A same-origin URL carries the app's base path, which the router adds
  // itself; a path the producer wrote is already relative to it.
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(trimmed);
  const { basePath } = app;
  let path = url.pathname;
  if (absolute && basePath) {
    if (path === basePath || path.startsWith(`${basePath}/`)) {
      path = path.slice(basePath.length) || '/';
    } else {
      // Same origin, but outside the app.
      return { href: url.href, external: true };
    }
  }
  return { href: `${path}${url.search}${url.hash}`, external: false };
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
  app: AppLocation,
): UpstreamInboxRow[] {
  return notifications.map(notification => {
    const { payload } = notification;
    const at = timeOf(notification.updated) ?? timeOf(notification.created);
    const link = notificationHref(payload.link, app);
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
      icon: 'notification',
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
