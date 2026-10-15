import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  AgentPlatformProviders,
  agentPlatformPlugin,
  sessionsListSearch,
  useNotifiableSessions,
  useSessionNotificationRecord,
} from '@giantswarm/backstage-plugin-agent-platform';
import { useShellDocumentTitleCount } from '@giantswarm/backstage-plugin-ui-react';
import {
  useDesktopNotifications,
  type DesktopNotifications,
} from '../desktopNotifications';
import type { InboxRow } from '../types';
import {
  isAt,
  NOTIFICATIONS_HASH,
  useInboxInterruptions,
} from '../useInboxInterruptions';
import { useSessionRowSource } from '../useSessionRowSource';

export type NotificationInboxValue = {
  /** Every source's rows, newest first. */
  rows: InboxRow[];
  /** Every source has read once. */
  ready: boolean;
  unreadCount: number;
  /** Marks one row read, as clicking it does. */
  markRead: (row: InboxRow) => void;
  /** "Mark all read": every unread row, in one write per store. */
  markAllRead: () => Promise<void>;
  /** The overlay (a popover on the rail, a sheet on a phone). */
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  desktop: DesktopNotifications;
};

const InboxContext = createContext<NotificationInboxValue | undefined>(
  undefined,
);

/**
 * The Notification inbox, for the bell, the overlay and the phone's Profile
 * menu; undefined outside a {@link NotificationInboxProvider}, or when the
 * Agent Platform is not there to read.
 */
export function useNotificationInbox(): NotificationInboxValue | undefined {
  return useContext(InboxContext);
}

/** Newest first; rows that cannot say when go last. */
function byNewest(a: InboxRow, b: InboxRow): number {
  return (b.at ?? -Infinity) - (a.at ?? -Infinity);
}

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

function Inbox({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  const visible = useDocumentVisible();
  const sessionsRoute = useRouteRef(agentPlatformPlugin.routes.sessions);
  const record = useSessionNotificationRecord();
  const { markSeen, markManySeen } = record;

  // The row sources, merged. A further source (the MCP sign-in row, the
  // upstream notifications store) is one more entry here.
  const sessionSource = useSessionRowSource(record);
  const sources = [sessionSource];
  const ready = sources.every(source => source.ready);
  const rows = useMemo(
    () => [...sessionSource.rows].sort(byNewest),
    [sessionSource.rows],
  );
  const unreadCount = rows.filter(row => row.unread).length;

  const [isOpen, setOpenState] = useState(false);
  const desktop = useDesktopNotifications();

  const markRead = useCallback(
    (row: InboxRow) => {
      if (row.unread) {
        markSeen(row.read.target).catch(() => {});
      }
    },
    [markSeen],
  );

  const markAllRead = useCallback(async () => {
    const targets = rows
      .filter(row => row.unread && row.read.kind === 'seenRecord')
      .map(row => row.read.target);
    if (targets.length > 0) {
      await markManySeen(targets);
    }
  }, [rows, markManySeen]);

  const { overlayOpened } = useInboxInterruptions({
    rows,
    ready,
    desktop,
    waitingHref: sessionsRoute
      ? `${sessionsRoute()}${sessionsListSearch({ state: 'waiting' })}`
      : undefined,
    openOverlay: () => setOpenState(true),
  });

  const setOpen = useCallback(
    (open: boolean) => {
      setOpenState(open);
      if (open) {
        overlayOpened();
      }
    },
    [overlayOpened],
  );

  // A link to the overlay (a summary toast's "Open notifications") opens it
  // and leaves the address as it was.
  useEffect(() => {
    if (hash === NOTIFICATIONS_HASH) {
      setOpen(true);
      navigate({ pathname, search }, { replace: true });
    }
  }, [hash, pathname, search, navigate, setOpen]);

  // The session on screen counts as seen: opening a session marks its row
  // read. Only while the tab is visible — a session parked in a background
  // tab still notifies.
  const marking = useRef(new Set<string>());
  useEffect(() => {
    if (!visible || !record.isKnown) {
      return;
    }
    const onScreen = rows.filter(
      row =>
        row.unread && isAt(pathname, row.href) && !marking.current.has(row.id),
    );
    for (const row of onScreen) {
      marking.current.add(row.id);
      markSeen(row.read.target)
        .catch(() => {})
        .finally(() => marking.current.delete(row.id));
    }
  }, [rows, pathname, visible, record.isKnown, markSeen]);

  useShellDocumentTitleCount(unreadCount);

  const value = useMemo<NotificationInboxValue>(
    () => ({
      rows,
      ready,
      unreadCount,
      markRead,
      markAllRead,
      isOpen,
      setOpen,
      desktop,
    }),
    [rows, ready, unreadCount, markRead, markAllRead, isOpen, setOpen, desktop],
  );

  return (
    <InboxContext.Provider value={value}>{children}</InboxContext.Provider>
  );
}

/**
 * The Notification inbox of the Agent Platform shell: rows derived in the
 * browser from the shell's own reads (the person's sessions today), the
 * unread count in the bell and the document title, toasts in the visible
 * tab and opt-in desktop notifications.
 *
 * Mount it once per shell, around the rail: the bell and the phone's Profile
 * menu read it, and a second mount would announce every row twice. Off the
 * shell (classic pages) it is not mounted, so nothing shows there.
 *
 * Guarded like the rest of the rail for tests that mock the agent-platform
 * plugin partially: without its data hooks the rail renders without a bell.
 */
export function NotificationInboxProvider({
  children,
}: {
  children: ReactNode;
}) {
  if (
    !AgentPlatformProviders ||
    !useNotifiableSessions ||
    !useSessionNotificationRecord
  ) {
    return <>{children}</>;
  }
  return (
    <AgentPlatformProviders>
      <Inbox>{children}</Inbox>
    </AgentPlatformProviders>
  );
}
