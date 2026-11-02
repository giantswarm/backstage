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
import { TOAST_CONTAINER } from '../../ShellMain/toastHeight';

/**
 * The most rows one read announces one toast (or desktop notification) each.
 * Past it, a burst — an orchestrator fanning out — is one, instead of a stack
 * nobody reads.
 */
export const TOAST_BURST = 3;

/**
 * How long an inbox toast stays: a brief heads-up, the 6 s most of the
 * portal's toasts take (their module-local `TOAST_TIMEOUT_MS`). The bell is
 * where the row waits; the toast pauses while the pointer rests on it (or
 * focus is in it), so one being read does not go. One raised while the
 * window is not the one the person works in waits for them: its time starts
 * when the window has the focus again.
 */
export const INBOX_TOAST_TIMEOUT_MS = 6000;

/** How often a held toast (pointer or focus on it) is looked at again. */
const HELD_RECHECK_MS = 1000;

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

/**
 * A toast posted and maybe still up (it may have timed out): the rows it
 * speaks for, and what closes it sooner.
 */
type OpenToast = {
  toast: ToastApiPostResult;
  ids: string[];
  /** Its row's page on screen answers it. */
  row?: InboxRow;
  /** Visiting exactly this page answers it. */
  closeOnExactPath?: string;
  /** Opening the overlay answers it. */
  closeOnOverlay?: boolean;
  /**
   * Posted while the window did not have the focus, without a timeout: its
   * time starts once the window has it.
   */
  awaitsFocus?: boolean;
};

/**
 * Whether the person is on the toasts: the pointer rests on them or the focus
 * is in them, which holds the upstream toasts' own timers too.
 */
function toastsHeld(): boolean {
  const container = document.querySelector(TOAST_CONTAINER);
  return Boolean(container?.matches(':hover, :focus-within'));
}

/** The kinds of row that are about one session each. */
const SESSION_KINDS: ReadonlySet<InboxRow['kind']> = new Set([
  'waiting',
  'failed',
  'turnFinished',
]);

/**
 * "2 sessions need your attention" while every row is a session's;
 * "notifications" once any is not (the MCP sign-in row, any later producer).
 */
function attentionTitle(rows: InboxRow[]) {
  const noun = rows.every(row => SESSION_KINDS.has(row.kind))
    ? 'session'
    : 'notification';
  return `${countNoun(rows.length, noun)} ${
    rows.length === 1 ? 'needs' : 'need'
  } your attention`;
}

/** Where a row's toast and desktop notification lead. */
function linkOf(row: InboxRow): string | undefined {
  return row.announce.href ?? row.href;
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
 * first read. A row that only narrows one the tab read (`narrows`) is not
 * news. A row that shows up later with neither (an installation
 * answering late with an old wait) is quietly unread. Nothing is raised for
 * the session on screen in the window the person works in. A toast goes on
 * its own after {@link INBOX_TOAST_TIMEOUT_MS} (counted from when the window
 * has the focus), or sooner once its row goes or is read, or its page is
 * opened.
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
  isOnScreen,
  attention,
  desktop,
  waitingHref,
  openOverlay,
  hashActions,
}: {
  rows: InboxRow[];
  subjects: ReadonlySet<string>;
  ready: boolean;
  /**
   * Whether a row is about the page at `pathname`, by its source's rule: no
   * toast for it, and its toast closes there.
   */
  isOnScreen: (row: InboxRow, pathname: string) => boolean;
  attention: PageAttention;
  desktop: DesktopNotifications;
  /** The Sessions list on its Waiting filter, when that route is bound. */
  waitingHref?: string;
  openOverlay: () => void;
  /** Hash links that act where the person is (`#notifications`). */
  hashActions: Readonly<Record<string, () => void>>;
}): { overlayOpened: () => void } {
  const toastApi = useApi(toastApiRef);
  const navigate = useNavigate();
  const location = useLocation();

  // What this tab has read: from an earlier mount, else nothing yet.
  const memory = useRef<TabMemory | undefined>(readTabMemory());
  // Toasts posted (some may have timed out), so they can be closed sooner
  // when they stop being true.
  const open = useRef(new Map<string, OpenToast>());
  const toastCount = useRef(0);
  // The timers of toasts raised while the window did not have the focus.
  const focusTimers = useRef(new Set<number>());
  // Read inside the rows effect without re-running it on every navigation.
  const latest = useRef({
    location,
    attention,
    desktop,
    openOverlay,
    isOnScreen,
    hashActions,
  });
  latest.current = {
    location,
    attention,
    desktop,
    openOverlay,
    isOnScreen,
    hashActions,
  };

  // A toast goes after its time, unless the window it shows in is not the one
  // the person works in: a toast they could not have seen waits for them.
  const post = useCallback(
    (
      key: string,
      message: ToastApiMessage,
      entry: Omit<OpenToast, 'toast' | 'awaitsFocus'>,
    ) => {
      open.current.get(key)?.toast.close();
      const awaitsFocus = !latest.current.attention.focused;
      open.current.set(key, {
        ...entry,
        awaitsFocus,
        toast: toastApi.post(
          awaitsFocus
            ? message
            : { ...message, timeout: INBOX_TOAST_TIMEOUT_MS },
        ),
      });
    },
    [toastApi],
  );

  useEffect(() => {
    if (!ready) {
      return;
    }
    const {
      location: here,
      attention: now,
      desktop: desk,
      isOnScreen: isRowOnScreen,
    } = latest.current;
    // The row on screen in the window the person works in: its page says
    // it, louder, and marks it read. A visible window behind another
    // application is not being watched.
    const onScreen = (row: InboxRow) =>
      now.visible && now.focused && isRowOnScreen(row, here.pathname);

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
        !before.rows.some(id => row.narrows?.(id)) &&
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
          // The toast renders a link as a plain anchor, which would take a
          // link out of the portal in this tab and leave the shell: such a
          // row is opened from the overlay, in a new tab.
          const to = linkOf(row);
          let link: { label: string; href: string } | undefined;
          if (row.external) {
            link = { label: 'Open notifications', href: NOTIFICATIONS_HASH };
          } else if (to) {
            link = { label: row.announce.linkLabel, href: to };
          }
          post(
            row.id,
            {
              title: row.announce.title,
              description: row.announce.description,
              status: row.announce.status,
              links: link ? [link] : undefined,
            },
            { ids: [row.id], row, closeOnOverlay: row.external },
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
            onClick: () => {
              const link = linkOf(row);
              const action = link && latest.current.hashActions[link];
              if (action) {
                action();
              } else if (!link) {
                latest.current.openOverlay();
              } else if (row.external) {
                window.open(link, '_blank', 'noopener');
              } else {
                navigate(link);
              }
            },
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
        (entry.row &&
          latest.current.isOnScreen(entry.row, location.pathname)) ||
        location.pathname === entry.closeOnExactPath
      ) {
        entry.toast.close();
        open.current.delete(key);
      }
    }
  }, [location.pathname]);

  // Back in the window: the toasts raised while away get their time now, held
  // like the upstream timers while the person is on them.
  useEffect(() => {
    if (!attention.focused) {
      return;
    }
    const timers = focusTimers.current;
    const expire = (key: string, entry: OpenToast) => {
      const timer = window.setTimeout(
        () => {
          timers.delete(timer);
          if (open.current.get(key) !== entry) {
            return;
          }
          if (toastsHeld()) {
            expire(key, entry);
            return;
          }
          entry.toast.close();
          open.current.delete(key);
        },
        entry.awaitsFocus ? INBOX_TOAST_TIMEOUT_MS : HELD_RECHECK_MS,
      );
      timers.add(timer);
      entry.awaitsFocus = false;
    };
    for (const [key, entry] of open.current) {
      if (entry.awaitsFocus) {
        expire(key, entry);
      }
    }
  }, [attention.focused]);

  // Leaving the shell (the inbox unmounts) leaves nothing behind.
  useEffect(() => {
    const toasts = open.current;
    const timers = focusTimers.current;
    return () => {
      toasts.forEach(entry => entry.toast.close());
      toasts.clear();
      timers.forEach(timer => window.clearTimeout(timer));
      timers.clear();
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
