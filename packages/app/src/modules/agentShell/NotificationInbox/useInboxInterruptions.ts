import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  toastApiRef,
  useApi,
  type ToastApiMessage,
  type ToastApiPostResult,
} from '@backstage/frontend-plugin-api';
import { countNoun } from '@giantswarm/backstage-plugin-ui-react';
import {
  showDesktopNotification,
  type DesktopNotifications,
} from './desktopNotifications';
import type { InboxRow } from './types';

/**
 * The most rows one read announces one toast (or desktop notification) each.
 * Past it, a burst — an orchestrator fanning out, an installation's states
 * arriving late — is one, instead of a stack nobody reads.
 */
export const TOAST_BURST = 3;

/**
 * How far before the tab's first read a row may have changed and still be
 * news when it first shows up later (an installation answering late): the
 * row's time comes from the server's clock, the first read's from the
 * browser's.
 */
export const CLOCK_SKEW_MS = 60_000;

/** The location hash a link uses to open the inbox's overlay. */
export const NOTIFICATIONS_HASH = '#notifications';

/** The tag of the one desktop notification a burst raises. */
const BURST_TAG = 'agent-platform-notifications';

/** Whether `pathname` is the page `href` opens (or one below it). */
export function isAt(pathname: string, href: string | undefined): boolean {
  return (
    href !== undefined && (pathname === href || pathname.startsWith(`${href}/`))
  );
}

/** A toast still up: the rows it speaks for, and what closes it. */
type OpenToast = {
  toast: ToastApiPostResult;
  ids: string[];
  /** Visiting this page, or one below it, answers it. */
  closeOnPath?: string;
  /** Visiting exactly this page answers it. */
  closeOnExactPath?: string;
  /** Opening the overlay answers it. */
  closeOnOverlay?: boolean;
};

function attentionTitle(count: number) {
  return `${countNoun(count, 'session')} ${
    count === 1 ? 'needs' : 'need'
  } your attention`;
}

/**
 * Tells the person about rows as they arrive: toasts in the visible tab,
 * desktop notifications once switched on.
 *
 * Rows present and unread at the tab's first read are **catch-up**: they
 * stay unread in the bell, with one summary toast at most and no desktop
 * notification. A row is **news** when it is unread and appeared, or changed
 * identity, after that first read. Nothing is raised for the session on
 * screen in the visible tab. A toast closes once its row goes or is read, or
 * its page is opened.
 *
 * Each tab decides on its own; desktop notifications are deduplicated across
 * tabs by the browser, through their `tag`.
 */
export function useInboxInterruptions({
  rows,
  ready,
  desktop,
  waitingHref,
  openOverlay,
}: {
  rows: InboxRow[];
  ready: boolean;
  desktop: DesktopNotifications;
  /** The Sessions list on its Waiting filter, when that route is bound. */
  waitingHref?: string;
  openOverlay: () => void;
}): { overlayOpened: () => void } {
  const toastApi = useApi(toastApiRef);
  const navigate = useNavigate();
  const location = useLocation();

  // When the tab first read every source; undefined until then.
  const firstReadAt = useRef<number>();
  // Every row id this tab has seen, so a row is announced once.
  const known = useRef(new Set<string>());
  // Toasts still up, so they can be closed when they stop being true.
  const open = useRef(new Map<string, OpenToast>());
  const toastCount = useRef(0);
  // Read inside the rows effect without re-running it on every navigation.
  const locationRef = useRef(location);
  locationRef.current = location;
  const desktopRef = useRef(desktop);
  desktopRef.current = desktop;
  const openOverlayRef = useRef(openOverlay);
  openOverlayRef.current = openOverlay;

  const post = useCallback(
    (
      key: string,
      message: ToastApiMessage,
      entry: Omit<OpenToast, 'toast'>,
    ) => {
      open.current.get(key)?.toast.close();
      open.current.set(key, { ...entry, toast: toastApi.post(message) });
    },
    [toastApi],
  );

  useEffect(() => {
    if (!ready) {
      return;
    }
    const { pathname, search } = locationRef.current;
    const visible = !document.hidden;
    const overlayHref = `${pathname}${search}${NOTIFICATIONS_HASH}`;
    // The session on screen: its page says it, louder, and marks it read.
    const onScreen = (row: InboxRow) => visible && isAt(pathname, row.href);

    // A row that went, or was read here or elsewhere, takes its toast along.
    const unread = new Set(rows.filter(row => row.unread).map(row => row.id));
    for (const [key, entry] of open.current) {
      if (!entry.ids.some(id => unread.has(id))) {
        entry.toast.close();
        open.current.delete(key);
      }
    }

    const isFirstRead = firstReadAt.current === undefined;
    if (isFirstRead) {
      firstReadAt.current = Date.now();
    }
    const since = (firstReadAt.current ?? 0) - CLOCK_SKEW_MS;
    const unseenByTab = rows.filter(row => !known.current.has(row.id));
    rows.forEach(row => known.current.add(row.id));

    if (isFirstRead) {
      const catchUp = unseenByTab.filter(row => row.unread && !onScreen(row));
      if (catchUp.length > 0 && visible) {
        post(
          'catch-up',
          {
            title: attentionTitle(catchUp.length),
            status: 'info',
            links: [{ label: 'Open notifications', href: overlayHref }],
          },
          { ids: catchUp.map(row => row.id), closeOnOverlay: true },
        );
      }
      return;
    }

    const news = unseenByTab.filter(
      row =>
        row.unread &&
        !onScreen(row) &&
        (row.at === undefined || row.at >= since),
    );
    if (news.length === 0) {
      return;
    }

    const burst = news.length > TOAST_BURST;
    const allWaiting = news.every(row => row.waiting);

    if (visible) {
      if (burst) {
        toastCount.current += 1;
        const ids = news.map(row => row.id);
        if (allWaiting && waitingHref) {
          post(
            `burst:${toastCount.current}`,
            {
              title: `${news.length} sessions need your input`,
              status: 'warning',
              links: [{ label: 'Show waiting sessions', href: waitingHref }],
            },
            { ids, closeOnExactPath: waitingHref.split('?')[0] },
          );
        } else {
          post(
            `burst:${toastCount.current}`,
            {
              title: attentionTitle(news.length),
              status: 'info',
              links: [{ label: 'Open notifications', href: overlayHref }],
            },
            { ids, closeOnOverlay: true },
          );
        }
      } else {
        for (const row of news) {
          post(
            row.id,
            {
              title: row.announce.title,
              description: row.announce.description,
              status: row.announce.status,
              links: row.href
                ? [{ label: row.announce.linkLabel, href: row.href }]
                : undefined,
            },
            { ids: [row.id], closeOnPath: row.href },
          );
        }
      }
    }

    // A tab the person is not looking at: the desktop's turn, once they have
    // switched it on. A focused tab already toasts.
    if (desktopRef.current.enabled && !document.hasFocus()) {
      if (burst) {
        showDesktopNotification({
          title: attentionTitle(news.length),
          tag: BURST_TAG,
          onClick: () => openOverlayRef.current(),
        });
      } else {
        for (const row of news) {
          showDesktopNotification({
            title: row.announce.title,
            body: row.announce.description,
            tag: row.id,
            onClick: () => {
              if (row.href) {
                navigate(row.href);
              } else {
                openOverlayRef.current();
              }
            },
          });
        }
      }
    }
    // Keyed on the rows alone: the location, the desktop choice and the
    // callbacks are read as of now through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, ready]);

  // Opening a row's page — or, for a burst, the list — answers its toast.
  useEffect(() => {
    for (const [key, entry] of open.current) {
      if (
        isAt(location.pathname, entry.closeOnPath) ||
        location.pathname === entry.closeOnExactPath
      ) {
        entry.toast.close();
        open.current.delete(key);
      }
    }
  }, [location.pathname]);

  // Leaving the shell (the inbox unmounts) leaves nothing behind.
  useEffect(() => {
    const toasts = open.current;
    return () => {
      toasts.forEach(entry => entry.toast.close());
      toasts.clear();
    };
  }, []);

  const overlayOpened = useCallback(() => {
    for (const [key, entry] of open.current) {
      if (entry.closeOnOverlay) {
        entry.toast.close();
        open.current.delete(key);
      }
    }
  }, []);

  return { overlayOpened };
}
