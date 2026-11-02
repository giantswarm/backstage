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
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import { McpSignInProvider } from '@giantswarm/backstage-plugin-muster';
import {
  usePageAttention,
  useShellDocumentTitleCount,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  useDesktopNotifications,
  type DesktopNotifications,
} from '../hooks/useDesktopNotifications';
import { inboxQueryClient } from '../hooks/inboxQueryClient';
import { useInboxInterruptions } from '../hooks/useInboxInterruptions';
import { useMcpSignInRowSource } from '../hooks/useMcpSignInRowSource';
import { useSeenRecordSource } from '../hooks/useSeenRecordSource';
import { useSessionRowSource } from '../hooks/useSessionRowSource';
import { useUpstreamRowSource } from '../hooks/useUpstreamRowSource';
import {
  NOTIFICATIONS_HASH,
  useToastLinkRouting,
} from '../hooks/useToastLinkRouting';
import type { InboxRow, ReadableInboxRowSource } from '../types';
import { MCP_SIGN_IN_HASH } from '../utils/mcpSignInRow';

export type NotificationInboxValue = {
  /** The rows, newest first. */
  rows: InboxRow[];
  /** The rows' sources have read once. */
  ready: boolean;
  unreadCount: number;
  /** Marks a row read because the person opened it. */
  markRead: (row: InboxRow) => void;
  /**
   * Opens a row that acts in place (its `action`, such as the MCP sign-in
   * row's Sign in): marks it read, closes the overlay and then acts. The one
   * path for its button, its toast and its desktop notification.
   */
  openInPlace: (row: InboxRow) => void;
  /**
   * "Mark all read": every unread row, a write per source that has one (the
   * seen marks in one write; the store's unread notifications, read first,
   * in another). Rejects when a source could not mark them, after the others
   * did.
   */
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

/** Pinned rows first, then newest first; rows that cannot say when go last. */
function byNewest(a: InboxRow, b: InboxRow): number {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) {
    return a.pinned ? -1 : 1;
  }
  return (b.at ?? -Infinity) - (a.at ?? -Infinity);
}

function Inbox({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  const attention = usePageAttention();
  const sessionsRoute = useRouteRef(agentPlatformPlugin.routes.sessions);
  const record = useSessionNotificationRecord();

  // Two kinds of source, one inbox: rows the shell derives from its own reads
  // (the sessions, the MCP sign-in), read through the Seen record, and what
  // other portal features send through the upstream notifications store.
  // Each row is read through the source it came from.
  const sessions = useSessionRowSource(record);
  const mcp = useMcpSignInRowSource(record);
  const derived = useSeenRecordSource(record, sessions, mcp);
  const upstream = useUpstreamRowSource();
  const { refresh: refreshUpstream } = upstream;
  const sources: ReadableInboxRowSource[] = [derived, upstream];
  const rows = useMemo<InboxRow[]>(
    () => [...derived.rows, ...upstream.rows].sort(byNewest),
    [derived.rows, upstream.rows],
  );
  const subjects = useMemo(
    () => new Set([...derived.subjects, ...upstream.subjects]),
    [derived.subjects, upstream.subjects],
  );
  const ready = sources.every(source => source.ready);
  const unreadCount = rows.filter(row => row.unread).length;

  // Read inside callbacks without making them change with every read.
  const latestSources = useRef(sources);
  latestSources.current = sources;
  const sourceOf = useCallback(
    (row: InboxRow) =>
      latestSources.current.find(source => source.rows.includes(row)),
    [],
  );

  const [isOpen, setOpenState] = useState(false);
  const desktop = useDesktopNotifications();

  // Rows whose read mark is on its way, so a row is written once however it
  // was read: clicked, then on screen once its page opens.
  const marking = useRef(new Set<string>());
  const markOnce = useCallback(
    (row: InboxRow, opened: boolean) => {
      const source = sourceOf(row);
      if (!source || !row.unread || marking.current.has(row.id)) {
        return;
      }
      marking.current.add(row.id);
      source
        .markRead(row, opened)
        .catch(() => {})
        .finally(() => marking.current.delete(row.id));
    },
    [sourceOf],
  );

  const markRead = useCallback(
    (row: InboxRow) => markOnce(row, true),
    [markOnce],
  );

  // A write per source with unread rows, all settled before the one report:
  // "Mark all read" is reported when it marked anything, even if another
  // source failed, and not for a click that found nothing left to mark.
  const { mutateAsync: markAllSources } = useTrackedMutation(
    {
      mutationFn: async () => {
        const results = await Promise.allSettled(
          latestSources.current
            .filter(source => source.rows.some(row => row.unread))
            .map(source => source.markAllRead()),
        );
        return {
          marked: results.some(
            result => result.status === 'fulfilled' && result.value,
          ),
          failure: results.find(
            (result): result is PromiseRejectedResult =>
              result.status === 'rejected',
          )?.reason,
        };
      },
      event: ({ marked }) =>
        marked
          ? { name: 'AgentPlatform.notificationsMarkedRead', attributes: {} }
          : null,
    },
    inboxQueryClient,
  );
  const markAllRead = useCallback(async () => {
    const { failure } = await markAllSources();
    if (failure) {
      throw failure;
    }
  }, [markAllSources]);

  // Opening the overlay, however it opens, answers the toasts that point to
  // it; `interruptions` is read through a ref because it needs the opener.
  const overlayOpened = useRef(() => {});
  const setOpen = useCallback(
    (open: boolean) => {
      setOpenState(open);
      if (open) {
        overlayOpened.current();
        refreshUpstream();
      }
    },
    [refreshUpstream],
  );
  const openOverlay = useCallback(() => setOpen(true), [setOpen]);

  // A row that acts in place: read, the overlay closed, and its action once
  // the overlay is gone, so the dialog it opens is not handed the focus the
  // closing overlay gives back.
  const [pendingAction, setPendingAction] = useState<() => void>();
  const openInPlace = useCallback(
    (row: InboxRow) => {
      markRead(row);
      setOpen(false);
      const act = row.action?.onAction;
      if (act) {
        setPendingAction(() => act);
      }
    },
    [markRead, setOpen],
  );
  useEffect(() => {
    if (!pendingAction || isOpen) {
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => {
      setPendingAction(undefined);
      pendingAction();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingAction, isOpen]);

  // The MCP sign-in row from a link (its toast, its desktop notification,
  // the address): opened in place, if it is still there.
  const latestRows = useRef(rows);
  latestRows.current = rows;
  const openMcpSignIn = useCallback(() => {
    const row = latestRows.current.find(each => each.kind === 'mcpSignIn');
    if (row) {
      openInPlace(row);
    }
  }, [openInPlace]);

  // Links that act where the person is, instead of opening a page.
  const hashActions = useMemo<Readonly<Record<string, () => void>>>(
    () => ({
      [NOTIFICATIONS_HASH]: openOverlay,
      [MCP_SIGN_IN_HASH]: openMcpSignIn,
    }),
    [openOverlay, openMcpSignIn],
  );

  const interruptions = useInboxInterruptions({
    rows,
    subjects,
    ready,
    isOnScreen: (row, path) => Boolean(sourceOf(row)?.isOnScreen(row, path)),
    attention,
    desktop,
    waitingHref: sessionsRoute
      ? `${sessionsRoute()}${sessionsListSearch({ state: 'waiting' })}`
      : undefined,
    openOverlay,
    hashActions,
  });
  overlayOpened.current = interruptions.overlayOpened;

  useToastLinkRouting(hashActions);

  // `#notifications` or `#mcp-sign-in` in the address (a link the toasts'
  // routing did not take, a new tab, a reload) acts once and leaves the
  // address as it was. `#mcp-sign-in` waits for the sign-in status: until it
  // is read there is no row to open, nor an installation to sign in to.
  const latestHashActions = useRef(hashActions);
  latestHashActions.current = hashActions;
  const isMcpRead = mcp.ready;
  useEffect(() => {
    const action = latestHashActions.current[hash];
    if (!action || (hash === MCP_SIGN_IN_HASH && !isMcpRead)) {
      return;
    }
    action();
    navigate({ pathname, search }, { replace: true });
  }, [hash, pathname, search, navigate, isMcpRead]);

  // A row on screen counts as seen (each source says which page that is):
  // opening a session marks its row read. Only while the person works in this
  // window — a session parked in a background tab, or in a window behind
  // another application, still notifies — and only once the row's source
  // knows what the person has read.
  useEffect(() => {
    if (!attention.visible || !attention.focused) {
      return;
    }
    latestSources.current
      .filter(source => source.ready)
      .forEach(source =>
        source.rows
          .filter(row => source.isOnScreen(row, pathname))
          .forEach(row => markOnce(row, false)),
      );
  }, [rows, ready, pathname, attention.visible, attention.focused, markOnce]);

  useShellDocumentTitleCount(unreadCount);

  const value = useMemo<NotificationInboxValue>(
    () => ({
      rows,
      ready,
      unreadCount,
      markRead,
      openInPlace,
      markAllRead,
      isOpen,
      setOpen,
      desktop,
    }),
    [
      rows,
      ready,
      unreadCount,
      markRead,
      openInPlace,
      markAllRead,
      isOpen,
      setOpen,
      desktop,
    ],
  );

  return (
    <InboxContext.Provider value={value}>{children}</InboxContext.Provider>
  );
}

/**
 * The Notification inbox of the Agent Platform shell: rows derived in the
 * browser from the shell's own reads (the person's sessions, and muster's
 * sign-in status for their home installation) and plain rows other portal
 * features send through the upstream notifications store, the unread count
 * in the bell and the document title, toasts in the visible tab and opt-in
 * desktop notifications.
 *
 * Mount it once per shell, around the rail: the bell and the phone's Profile
 * menu read it, and a second mount would announce every row twice. Off the
 * shell (classic pages) it is not mounted, so nothing shows there.
 *
 * Guarded like the rest of the rail for tests that mock the agent-platform
 * plugin partially: without its data hooks the rail renders without a bell.
 * Without muster's sign-in status there is no MCP sign-in row.
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
  const inbox = <Inbox>{children}</Inbox>;
  return (
    <AgentPlatformProviders>
      {McpSignInProvider ? (
        <McpSignInProvider>{inbox}</McpSignInProvider>
      ) : (
        inbox
      )}
    </AgentPlatformProviders>
  );
}
