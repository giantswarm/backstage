import { type ReactNode, useMemo, useSyncExternalStore } from 'react';
import type { McpServerAwaitingSignIn } from '@giantswarm/backstage-plugin-muster';
import type {
  NotifiableSession,
  NotificationLevel,
  SeenMarkTarget,
} from '@giantswarm/backstage-plugin-agent-platform';
import type { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';

/**
 * A fake of what the Notification inbox reads from the agent-platform plugin:
 * the person's sessions and their states (the session-states read), and the
 * person's notification record (levels, origins, seen marks); and from the
 * muster plugin: the MCP sign-in status and its dialog. Tests mock the
 * plugin modules with {@link fakeInboxPluginExports} and
 * {@link fakeInboxMusterExports} and drive this store.
 *
 * Test-only. Kept beside the inbox so every shell test that renders the rail
 * fakes the same inputs the same way.
 */
type Store = {
  sessions: Map<string, NotifiableSession>;
  states: Map<string, SessionStateEntry>;
  isRead: boolean;
  isKnown: boolean;
  levels: Map<string, NotificationLevel>;
  portalStarted: Set<string>;
  seen: Map<string, string>;
  mcp: {
    installation?: string;
    waiting: McpServerAwaitingSignIn[];
    connected: string[];
    isRead: boolean;
    isAvailable: boolean;
    isDialogOpen: boolean;
  };
};

function emptyStore(): Store {
  return {
    sessions: new Map(),
    states: new Map(),
    isRead: true,
    isKnown: true,
    levels: new Map(),
    portalStarted: new Set(),
    seen: new Map(),
    mcp: {
      installation: 'gazelle',
      waiting: [],
      connected: [],
      isRead: true,
      isAvailable: true,
      isDialogOpen: false,
    },
  };
}

let store = emptyStore();
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach(listener => listener());
}

function useVersion() {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
}

const key = (installation: string, sessionId: string) =>
  `${installation}/${sessionId}`;

function seenKey(target: SeenMarkTarget) {
  return target.kind === 'session'
    ? `session:${key(target.installation, target.sessionId)}`
    : `mcp:${target.installation}`;
}

const writes = {
  setLevel: jest.fn(
    async (
      installation: string,
      sessionId: string,
      level: NotificationLevel,
    ) => {
      store.levels.set(key(installation, sessionId), level);
      emit();
    },
  ),
  markSeen: jest.fn(async (target: SeenMarkTarget) => {
    store.seen.set(seenKey(target), target.mark);
    emit();
  }),
  markManySeen: jest.fn(async (targets: readonly SeenMarkTarget[]) => {
    targets.forEach(target => store.seen.set(seenKey(target), target.mark));
    emit();
  }),
  replaceSeenMark: jest.fn(async (target: SeenMarkTarget, previous: string) => {
    if (store.seen.get(seenKey(target)) === previous) {
      store.seen.set(seenKey(target), target.mark);
      emit();
    }
  }),
};

export type FakeSession = {
  sessionId: string;
  installation?: string;
  title?: string;
  agentName?: string;
  state?: string;
  changedAt?: number;
  failureReason?: SessionStateEntry['failureReason'];
  portalStarted?: boolean;
  level?: NotificationLevel;
};

export const fakeInbox = {
  writes,
  /** Back to no sessions, everything read, nothing seen. */
  reset() {
    store = emptyStore();
    Object.values(writes).forEach(write => write.mockClear());
    emit();
  },
  /**
   * The sessions the read now returns, with their states; a session without
   * a `state` is listed but not evaluated.
   */
  setSessions(sessions: FakeSession[]) {
    store.sessions = new Map();
    store.states = new Map();
    for (const session of sessions) {
      const installation = session.installation ?? 'gazelle';
      const id = key(installation, session.sessionId);
      store.sessions.set(id, {
        id,
        installation,
        sessionId: session.sessionId,
        title: session.title ?? session.sessionId,
        agentName: session.agentName ?? 'SRE Agent',
      });
      if (session.state) {
        store.states.set(id, {
          sessionId: session.sessionId,
          state: session.state,
          ...(session.changedAt === undefined
            ? {}
            : { changedAt: session.changedAt }),
          ...(session.failureReason
            ? { failureReason: session.failureReason }
            : {}),
        } as SessionStateEntry);
      }
      if (session.portalStarted) {
        store.portalStarted.add(id);
      }
      if (session.level) {
        store.levels.set(id, session.level);
      }
    }
    emit();
  },
  /** Whether the sessions and their states have been read yet. */
  setRead(isRead: boolean) {
    store.isRead = isRead;
    emit();
  },
  /** Marks a row seen as another tab or device would. */
  seeElsewhere(target: SeenMarkTarget) {
    store.seen.set(seenKey(target), target.mark);
    emit();
  },
  levelOf(installation: string, sessionId: string) {
    return store.levels.get(key(installation, sessionId)) ?? 'default';
  },
  /**
   * muster's next sign-in status read: the servers of the home installation
   * that wait for the person's sign-in, by name or `[name, display name]`,
   * and those it reports connected.
   */
  setMcpWaiting(
    servers: Array<string | [string, string]>,
    options: {
      connected?: string[];
      isRead?: boolean;
      isAvailable?: boolean;
    } = {},
  ) {
    store.mcp = {
      ...store.mcp,
      waiting: servers.map(server =>
        typeof server === 'string'
          ? { name: server, label: server }
          : { name: server[0], label: server[1] },
      ),
      connected: options.connected ?? [],
      isRead: options.isRead ?? true,
      isAvailable: options.isAvailable ?? true,
    };
    emit();
  },
  /** The seen mark stored for the installation's MCP sign-in row. */
  mcpSeenMark(installation = 'gazelle') {
    return store.seen.get(`mcp:${installation}`);
  },
};

function useNotifiableSessions() {
  const current = useVersion();
  return useMemo(
    () => ({
      sessions: new Map(store.sessions),
      states: new Map(store.states),
      isRead: store.isRead,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current],
  );
}

function useSessionNotificationRecord() {
  const current = useVersion();
  return useMemo(
    () => {
      const seen = new Map(store.seen);
      const levels = new Map(store.levels);
      const portalStarted = new Set(store.portalStarted);
      return {
        isKnown: store.isKnown,
        levelOf: (installation: string, sessionId: string) =>
          levels.get(key(installation, sessionId)) ?? 'default',
        isPortalStarted: (installation: string, sessionId: string) =>
          portalStarted.has(key(installation, sessionId)),
        isSeen: (target: SeenMarkTarget) =>
          seen.get(seenKey(target)) === target.mark,
        mcpSignInSeenMarkOf: (installation: string) =>
          seen.get(`mcp:${installation}`),
        setLevel: writes.setLevel,
        markSeen: writes.markSeen,
        markManySeen: writes.markManySeen,
        replaceSeenMark: writes.replaceSeenMark,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current],
  );
}

/** Stable, as the provider's is. */
function openSignIn() {
  store.mcp = { ...store.mcp, isDialogOpen: true };
  emit();
}

function useMcpSignIn() {
  const current = useVersion();
  return useMemo(
    () => ({
      installation: store.mcp.installation,
      waiting: store.mcp.waiting,
      connected: store.mcp.connected,
      isRead: store.mcp.isRead,
      isAvailable: store.mcp.isAvailable,
      openSignIn,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current],
  );
}

/** muster's sign-in dialog, faked: open or not, and a way out. */
function McpSignInProvider({ children }: { children: ReactNode }) {
  useVersion();
  return (
    <>
      {children}
      {store.mcp.isDialogOpen && (
        <div role="dialog" aria-label="Sign in to MCP servers">
          <button
            onClick={() => {
              store.mcp = { ...store.mcp, isDialogOpen: false };
              emit();
            }}
          >
            Close
          </button>
        </div>
      )}
    </>
  );
}

/**
 * The muster plugin's exports the inbox uses, faked: its sign-in status and
 * dialog, driven by {@link fakeInbox}'s `setMcpWaiting`. Spread into a
 * `jest.mock('@giantswarm/backstage-plugin-muster', …)` factory.
 */
export function fakeInboxMusterExports() {
  return { McpSignInProvider, useMcpSignIn };
}

/**
 * The agent-platform plugin's exports the inbox uses, faked: spread into a
 * `jest.mock('@giantswarm/backstage-plugin-agent-platform', …)` factory
 * (through `jest.requireActual` of this module).
 */
export function fakeInboxPluginExports() {
  return {
    AgentPlatformProviders: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
    AgentAvatar: ({ name }: { name: string }) => (
      <span data-testid="agent-avatar">{name}</span>
    ),
    PHONE_FULL_SCREEN_DIALOG: {},
    sessionsListSearch: ({ state }: { state?: string }) =>
      state ? `?state=${state}` : '',
    useNotifiableSessions,
    useSessionNotificationRecord,
  };
}
