import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  RouteFunc,
  ToastApiPostResult,
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';

import { useFleetSessionStates } from '../../hooks/useFleetSessionStates';
import { ACTIVE_REFETCH_INTERVAL_MS } from '../../lib/kagentSessionPolling';
import { sessionDetailRouteRef, sessionsRouteRef } from '../../routes';
import { AgentPlatformProviders } from '../AgentPlatformProviders';
import { needsAttention } from '../RecentSessions/helpers';
import { useSessions } from '../SessionsDataProvider';
import { sessionsListSearch } from '../SessionsTable/filters';
import { findNewlyWaiting } from './helpers';

/**
 * The most sessions one poll announces one toast each. Past it, a burst — an
 * orchestrator fanning out, an installation's summary arriving late — is one
 * toast that counts them and opens the Sessions list on its Waiting chip,
 * instead of a stack nobody reads.
 */
export const NEEDS_INPUT_TOAST_BURST = 3;

type SessionDetailRoute = RouteFunc<{
  installation: string;
  sessionId: string;
}>;

/** A toast still up: the sessions it speaks for, and the page that answers it. */
type OpenToast = {
  toast: ToastApiPostResult;
  ids: string[];
  /** The pathname whose visit closes it. */
  pathname: string;
};

function NeedsInputWatcher({
  sessionDetailRoute,
  sessionsPath,
}: {
  sessionDetailRoute: SessionDetailRoute;
  sessionsPath: string;
}) {
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
  // Toasts still up, so they can be closed when they stop being true. Keyed
  // by session id, or by `burst:<n>` for a toast that counts several.
  const open = useRef(new Map<string, OpenToast>());
  const burstCount = useRef(0);
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
    // its toast with it; a burst's toast goes once none of its sessions waits.
    for (const [key, entry] of open.current) {
      if (!entry.ids.some(id => needsAttention(states.get(id)))) {
        entry.toast.close();
        open.current.delete(key);
      }
    }

    // Not for the session on screen — its own page says so, louder — nor for
    // one the list does not know yet (no title, no agent to name).
    const news = flipped.flatMap(id => {
      const row = rowsById.get(id);
      const href = hrefOf(id);
      return row && href && href !== pathnameRef.current
        ? [{ id, row, href }]
        : [];
    });

    if (news.length > NEEDS_INPUT_TOAST_BURST) {
      burstCount.current += 1;
      open.current.set(`burst:${burstCount.current}`, {
        toast: toastApi.post({
          title: `${news.length} sessions need your input`,
          description: 'Several of your sessions started waiting for you.',
          status: 'warning',
          links: [
            {
              label: 'Show waiting sessions',
              href: `${sessionsPath}${sessionsListSearch({
                state: 'waiting',
              })}`,
            },
          ],
        }),
        ids: news.map(each => each.id),
        pathname: sessionsPath,
      });
      return;
    }

    for (const { id, row, href } of news) {
      open.current.get(id)?.toast.close();
      open.current.set(id, {
        toast: toastApi.post({
          title: `${row.agentName || 'An agent'} is waiting for you`,
          description: row.title,
          status: 'warning',
          links: [{ label: 'Open session', href }],
        }),
        ids: [id],
        pathname: href,
      });
    }
    // Keyed on the polled states alone: `rowsById` and the route builder are
    // read as of the latest poll, and a navigation is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states]);

  // Opening the session — or, for a burst, the list — is the answer to its
  // toast.
  useEffect(() => {
    for (const [key, entry] of open.current) {
      if (entry.pathname === pathname) {
        entry.toast.close();
        open.current.delete(key);
      }
    }
  }, [pathname]);

  // Leaving the shell (the watcher unmounts) leaves nothing behind.
  useEffect(() => {
    const toasts = open.current;
    return () => {
      toasts.forEach(entry => entry.toast.close());
      toasts.clear();
    };
  }, []);

  return null;
}

/**
 * A toast when one of the person's sessions starts waiting on them while they
 * are somewhere else in the shell — the prototype's "Support Triage is waiting
 * for you · Open session". More than {@link NEEDS_INPUT_TOAST_BURST} at once
 * are one toast that opens the Sessions list on its Waiting chip.
 *
 * Renders nothing itself: the toast goes through the app's `ToastApi`, the
 * shell's one toast idiom (dismissible, with a link). The colored dots in the
 * rail stay the primary signal; this only says the moment it happens, so
 * nothing is persisted — a reload starts watching afresh.
 *
 * Mount it once per shell, wherever every shell route renders it whatever the
 * rail's state: the shell's nav mounts it beside the rail, so a collapsed rail
 * and the phone's bottom bar get the toast too. A second mount would announce
 * every session twice.
 *
 * Mounts its own data providers. They share the plugin's query-client
 * singleton, and the states are read under the same query keys and on the
 * same fast tier as the rail's dots, so watching costs no extra requests.
 * Renders nothing when the session detail route is not bound (the Agent
 * Platform page disabled).
 *
 * A toast closes itself once its session stops waiting or is opened; the
 * session being looked at never raises one.
 */
export function NeedsInputToasts() {
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const sessionsRoute = useRouteRef(sessionsRouteRef);
  if (!sessionDetailRoute || !sessionsRoute) {
    return null;
  }
  return (
    <AgentPlatformProviders>
      <NeedsInputWatcher
        sessionDetailRoute={sessionDetailRoute}
        sessionsPath={sessionsRoute()}
      />
    </AgentPlatformProviders>
  );
}
