import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  RouteFunc,
  ToastApiPostResult,
  toastApiRef,
  useApi,
} from '@backstage/frontend-plugin-api';

import { useFleetSessionStates } from '../../hooks/useFleetSessionStates';
import { ACTIVE_REFETCH_INTERVAL_MS } from '../../lib/kagentSessionPolling';
import { needsAttention } from '../RecentSessions/helpers';
import { useSessions } from '../SessionsDataProvider';
import { findNewlyWaiting } from './helpers';

export type NeedsInputToastsProps = {
  /** Builds a session's detail path; the toast links there. */
  sessionDetailRoute: RouteFunc<{ installation: string; sessionId: string }>;
};

/**
 * A toast when one of the person's sessions starts waiting on them while they
 * are somewhere else in the shell — the prototype's "Support Triage is waiting
 * for you · Open session".
 *
 * Renders nothing itself: the toast goes through the app's `ToastApi`, the
 * shell's one toast idiom (dismissible, with a link). The colored dots in the
 * rail stay the primary signal; this only says the moment it happens, so
 * nothing is persisted — a reload starts watching afresh.
 *
 * Reads the same polled `session-states` the rail's dots read, under the same
 * query keys and on the same fast tier, so watching costs no extra requests.
 * Must render inside `AgentPlatformProviders` (it reads the sessions list).
 *
 * A toast closes itself once its session stops waiting or is opened; the
 * session being looked at never raises one.
 */
export function NeedsInputToasts({
  sessionDetailRoute,
}: NeedsInputToastsProps) {
  const toastApi = useApi(toastApiRef);
  const { pathname } = useLocation();
  const { rows } = useSessions();

  const installationsKey = Array.from(
    new Set(rows.map(row => row.installation)),
  )
    .sort()
    .join(',');
  const installations = useMemo(
    () => (installationsKey ? installationsKey.split(',') : []),
    [installationsKey],
  );
  const { states } = useFleetSessionStates(installations, {
    refetchIntervalMs: ACTIVE_REFETCH_INTERVAL_MS,
  });

  const rowsById = useMemo(
    () => new Map(rows.map(row => [row.id, row])),
    [rows],
  );

  // Watching starts now: a session already waiting when the shell opened is
  // the dots' to show, not news.
  const watchingSince = useRef(Date.now());
  // What the last look saw, per session: waiting or not.
  const previous = useRef(new Map<string, boolean>());
  // Toasts still up, so they can be closed when they stop being true.
  const open = useRef(new Map<string, ToastApiPostResult>());
  // Read inside the state effect without re-running it on every navigation.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const hrefOf = (id: string): string | undefined => {
    const row = rowsById.get(id);
    return row
      ? sessionDetailRoute({
          installation: row.installation,
          sessionId: row.sessionId,
        })
      : undefined;
  };

  useEffect(() => {
    const flipped = findNewlyWaiting(
      states,
      previous.current,
      watchingSince.current,
    );
    for (const [id, entry] of states) {
      previous.current.set(id, needsAttention(entry));
    }

    // A session that stopped waiting — answered elsewhere, canceled — takes
    // its toast with it.
    for (const [id, toast] of open.current) {
      if (!needsAttention(states.get(id))) {
        toast.close();
        open.current.delete(id);
      }
    }

    for (const id of flipped) {
      const row = rowsById.get(id);
      const href = hrefOf(id);
      // Not for the session on screen — its own page says so, louder — nor
      // for one the list does not know yet (no title, no agent to name).
      if (!row || !href || href === pathnameRef.current) {
        continue;
      }
      open.current.get(id)?.close();
      open.current.set(
        id,
        toastApi.post({
          title: `${row.agentName || 'An agent'} is waiting for you`,
          description: row.title,
          status: 'warning',
          links: [{ label: 'Open session', href }],
        }),
      );
    }
    // Keyed on the polled states alone: `rowsById` and the route builder are
    // read as of the latest poll, and a navigation is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states]);

  // Opening the session is the answer to its toast.
  useEffect(() => {
    for (const [id, toast] of open.current) {
      if (hrefOf(id) === pathname) {
        toast.close();
        open.current.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Leaving the shell (the rail unmounts) leaves nothing behind.
  useEffect(() => {
    const toasts = open.current;
    return () => {
      toasts.forEach(toast => toast.close());
      toasts.clear();
    };
  }, []);

  return null;
}
