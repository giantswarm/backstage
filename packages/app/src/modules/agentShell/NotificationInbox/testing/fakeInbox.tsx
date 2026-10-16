import { type ReactNode, useMemo, useSyncExternalStore } from 'react';
import type {
  NotifiableSession,
  NotificationLevel,
  SeenMarkTarget,
} from '@giantswarm/backstage-plugin-agent-platform';
import type { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';

/**
 * A fake of what the Notification inbox reads from the agent-platform plugin:
 * the person's sessions and their states (the session-states read), and the
 * person's notification record (levels, origins, seen marks). Tests mock the
 * plugin module with {@link fakeInboxPluginExports} and drive this store.
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
  /** Whether the person's notification record has been read yet. */
  setKnown(isKnown: boolean) {
    store.isKnown = isKnown;
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
        setLevel: writes.setLevel,
        markSeen: writes.markSeen,
        markManySeen: writes.markManySeen,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current],
  );
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
