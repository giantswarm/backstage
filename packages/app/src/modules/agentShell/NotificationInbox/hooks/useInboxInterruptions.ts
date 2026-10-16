import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  toastApiRef,
  useApi,
  type ToastApiMessage,
  type ToastApiPostResult,
} from '@backstage/frontend-plugin-api';
import {
  countNoun,
  type PageAttention,
} from '@giantswarm/backstage-plugin-ui-react';
import type { InboxRow } from '../types';
import {
  showDesktopNotification,
  type DesktopNotifications,
} from './useDesktopNotifications';
import { NOTIFICATIONS_HASH } from './useToastLinkRouting';

/**
 * The most rows one read announces one toast (or desktop notification) each.
 * Past it, a burst — an orchestrator fanning out — is one, instead of a stack
 * nobody reads.
 */
export const TOAST_BURST = 3;

/**
 * How far before the tab's first read a row may have changed and still be
 * news when its subject was not read before (an installation answering
 * late): the row's time comes from the server's clock, the first read's from
 * the browser's.
 */
export const CLOCK_SKEW_MS = 60_000;

/**
 * Where a tab keeps what it has read, so a return to the shell from a classic
 * page, or a reload, does not start catch-up over. `sessionStorage` is the
 * tab's own and outlives a reload.
 */
export const TAB_MEMORY_KEY = 'agentPlatform.notificationInbox.tab';

/** The tag of the one desktop notification a burst raises. */
const BURST_TAG = 'agent-platform-notifications';

/** Whether `pathname` is the page `href` opens (or one below it). */
export function isAt(pathname: string, href: string | undefined): boolean {
  return (
    href !== undefined && (pathname === href || pathname.startsWith(`${href}/`))
  );
}

/** What a tab remembers of its reads. */
type TabMemory = {
  /** When the tab first read every source (ms, the browser's clock). */
  firstReadAt: number;
  /** The rows of the last read. */
  rows: string[];
  /** The subjects of the last read. */
  subjects: string[];
};

function readTabMemory(): TabMemory | undefined {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(TAB_MEMORY_KEY) ?? 'null',
    );
    return typeof value?.firstReadAt === 'number' &&
      Array.isArray(value.rows) &&
      Array.isArray(value.subjects)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function writeTabMemory(memory: TabMemory) {
  try {
    window.sessionStorage.setItem(TAB_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Storage blocked: the tab remembers until the inbox unmounts.
  }
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

/** "2 sessions need your attention", or notifications once not all are. */
function attentionTitle(rows: readonly InboxRow[]) {
  const noun = rows.every(row => row.kind !== 'plain')
    ? 'session'
    : 'notification';
  return `${countNoun(rows.length, noun)} ${
    rows.length === 1 ? 'needs' : 'need'
  } your attention`;
}

/** Opens a row's link: in the app, or a new tab when it leads out of it. */
function openRow(
  row: InboxRow,
  navigate: (to: string) => void,
  openOverlay: () => void,
) {
  if (!row.href) {
    openOverlay();
  } else if (row.external) {
    window.open(row.href, '_blank', 'noopener');
  } else {
    navigate(row.href);
  }
}

/**
 * Tells the person about rows as they arrive: toasts in the visible tab,
 * desktop notifications once switched on.
 *
 * Rows present and unread at the tab's first read are **catch-up**: they
 * stay unread in the bell, with one summary toast at most and no desktop
 * notification. A row is **news** when it is unread and appeared, or changed
 * identity, after that first read, and either its subject was already read
 * by the tab (it changed while watched) or its time says it changed after the
 * first read. A row that shows up later with neither (an installation
 * answering late with an old wait) is quietly unread. Nothing is raised for
 * the session on screen in the window the person works in. A toast closes
 * once its row goes or is read, or its page is opened.
 *
 * The first read is the tab's, not the inbox's mount: a return from a classic
 * page or a reload picks up where the tab was. Each tab decides on its own;
 * desktop notifications are deduplicated across tabs by the browser, through
 * their `tag`.
 */
export function useInboxInterruptions({
  rows,
  subjects,
  ready,
  attention,
  desktop,
  waitingHref,
  openOverlay,
}: {
  rows: InboxRow[];
  subjects: ReadonlySet<string>;
  ready: boolean;
  attention: PageAttention;
  desktop: DesktopNotifications;
  /** The Sessions list on its Waiting filter, when that route is bound. */
  waitingHref?: string;
  openOverlay: () => void;
}): { overlayOpened: () => void } {
  const toastApi = useApi(toastApiRef);
  const navigate = useNavigate();
  const location = useLocation();

  // What this tab has read: from an earlier mount, else nothing yet.
  const memory = useRef<TabMemory | undefined>(readTabMemory());
  // Toasts still up, so they can be closed when they stop being true.
  const open = useRef(new Map<string, OpenToast>());
  const toastCount = useRef(0);
  // Read inside the rows effect without re-running it on every navigation.
  const latest = useRef({ location, attention, desktop, openOverlay });
  latest.current = { location, attention, desktop, openOverlay };

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
    const { location: here, attention: now, desktop: desk } = latest.current;
    // The session on screen in the window the person works in: its page
    // says it, louder, and marks it read. A visible window behind another
    // application is not being watched.
    const onScreen = (row: InboxRow) =>
      now.visible && now.focused && isAt(here.pathname, row.href);

    // A row that went, or was read here or elsewhere, takes its toast along.
    const unread = new Set(rows.filter(row => row.unread).map(row => row.id));
    for (const [key, entry] of open.current) {
      if (!entry.ids.some(id => unread.has(id))) {
        entry.toast.close();
        open.current.delete(key);
      }
    }

    const before = memory.current;
    memory.current = {
      firstReadAt: before?.firstReadAt ?? Date.now(),
      rows: rows.map(row => row.id),
      subjects: [...subjects],
    };
    writeTabMemory(memory.current);

    if (!before) {
      const catchUp = rows.filter(row => row.unread && !onScreen(row));
      if (catchUp.length > 0 && now.visible) {
        post(
          'catch-up',
          {
            title: attentionTitle(catchUp),
            status: 'info',
            links: [{ label: 'Open notifications', href: NOTIFICATIONS_HASH }],
          },
          { ids: catchUp.map(row => row.id), closeOnOverlay: true },
        );
      }
      return;
    }

    const known = new Set(before.rows);
    const watched = new Set(before.subjects);
    const since = before.firstReadAt - CLOCK_SKEW_MS;
    const news = rows.filter(
      row =>
        row.unread &&
        !known.has(row.id) &&
        !onScreen(row) &&
        (watched.has(row.subject) || (row.at !== undefined && row.at >= since)),
    );
    if (news.length === 0) {
      return;
    }

    const burst = news.length > TOAST_BURST;

    if (now.visible) {
      const ids = news.map(row => row.id);
      if (burst) {
        toastCount.current += 1;
        if (news.every(row => row.kind === 'waiting') && waitingHref) {
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
              title: attentionTitle(news),
              status: 'info',
              links: [
                { label: 'Open notifications', href: NOTIFICATIONS_HASH },
              ],
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

    // A window the person is not working in: the desktop's turn, once they
    // have switched it on. A focused window already toasts.
    if (desk.enabled && !now.focused) {
      if (burst) {
        showDesktopNotification({
          title: attentionTitle(news),
          tag: BURST_TAG,
          onClick: () => latest.current.openOverlay(),
        });
      } else {
        for (const row of news) {
          showDesktopNotification({
            title: row.announce.title,
            body: row.announce.description,
            tag: row.id,
            onClick: () =>
              openRow(row, navigate, () => latest.current.openOverlay()),
          });
        }
      }
    }
    // Keyed on the reads alone: the location, the page's attention, the
    // desktop choice and the callbacks are read as of now.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, subjects, ready]);

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
