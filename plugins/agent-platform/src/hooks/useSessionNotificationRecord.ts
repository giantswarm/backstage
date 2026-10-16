import { useCallback, useMemo } from 'react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import type { KagentSession } from '@giantswarm/backstage-plugin-agent-platform-common';

import {
  isPortalStarted as isPortalStartedIn,
  isSeen as isSeenIn,
  levelOf as levelOfIn,
  mcpSignInSeenMarkOf as mcpSignInSeenMarkOfIn,
  NOTIFICATION_SEEN_KEY,
  NOTIFICATION_SETTINGS_KEY,
  prunedSeen,
  prunedSettings,
  readNotificationSeen,
  readNotificationSettings,
  sessionKey,
  sessionKeysOf,
  sessionSeenMarkOf as sessionSeenMarkOfIn,
  withLevel,
  withPortalStarted,
  withSeen,
  type NotificationLevel,
  type SeenMarkTarget,
} from '../lib/notificationRecord';
import {
  storedSettingWriteClient,
  useStoredSetting,
  useStoredSettingUpdate,
} from './useStoredSetting';

/** Both keys are read again whenever the tab becomes visible. */
const RECORD_OPTIONS = { rereadWhenVisible: true };

type SessionRef = { installation: string; sessionId: string };

/**
 * Why rows are marked seen, when it is the person's own doing in the
 * Notification inbox: they opened a row (of this kind), or chose "Mark all
 * read". Reported to analytics; a write without one is not.
 */
export type SeenMarkReason =
  | { action: 'opened'; kind: 'waiting' | 'failed' | 'turnFinished' }
  | { action: 'markedAllRead' };

type SeenMarksWrite = {
  targets: readonly SeenMarkTarget[];
  reason?: SeenMarkReason;
};

/**
 * The person's notification settings per session — whether the portal
 * started it, and its Notification level — from the `agent-platform` bucket
 * (key `sessionNotificationSettings`, see `lib/notificationRecord`). Roams
 * across tabs and devices with the app's user-settings storage; every mounted
 * instance follows a change written anywhere.
 *
 * `isKnown` stays false until the stored value has been read: until then
 * every session reads as `default` and not portal-started, which a caller
 * that acts on the difference (the inbox) should wait out. Mount it once per
 * surface (a list passes what it needs to its rows), not once per row.
 */
export function useSessionNotificationSettings() {
  const { snapshot, update } = useStoredSetting(
    NOTIFICATION_SETTINGS_KEY,
    RECORD_OPTIONS,
  );
  const settings = useMemo(
    () =>
      readNotificationSettings(
        snapshot.presence === 'present' ? snapshot.value : undefined,
      ),
    [snapshot],
  );

  const levelOf = useCallback(
    (installation: string, sessionId: string): NotificationLevel =>
      levelOfIn(settings, installation, sessionId),
    [settings],
  );
  const isPortalStarted = useCallback(
    (installation: string, sessionId: string) =>
      isPortalStartedIn(settings, installation, sessionId),
    [settings],
  );

  const { mutateAsync: writeLevel } = useTrackedMutation(
    {
      mutationFn: ({
        installation,
        sessionId,
        level,
      }: SessionRef & { level: NotificationLevel }) =>
        update<NotificationLevel>(current => {
          const next = withLevel(
            readNotificationSettings(current),
            installation,
            sessionId,
            level,
            Date.now(),
          );
          return next && { value: next, result: level };
        }),
      event: level =>
        level
          ? {
              name: 'AgentPlatform.sessionNotificationLevelChanged',
              attributes: { level },
            }
          : null,
    },
    storedSettingWriteClient,
  );

  /**
   * Sets a session's level. `default` unmutes, and drops the entry of a
   * session the portal did not start; muting a session without an entry
   * creates one without making it portal-started.
   */
  const setLevel = useCallback(
    async (
      installation: string,
      sessionId: string,
      level: NotificationLevel,
    ) => {
      await writeLevel({ installation, sessionId, level });
    },
    [writeLevel],
  );

  const isKnown = snapshot.presence !== 'unknown';
  return useMemo(
    () => ({ isKnown, levelOf, isPortalStarted, setLevel }),
    [isKnown, levelOf, isPortalStarted, setLevel],
  );
}

/**
 * Records that the portal's `start_session` started a session, without
 * reading or watching the record: for `useCreateSession`, on every surface
 * that starts a session.
 */
export function usePortalStartedRecorder() {
  const update = useStoredSettingUpdate(NOTIFICATION_SETTINGS_KEY);
  const { mutateAsync } = useTrackedMutation(
    {
      mutationFn: ({ installation, sessionId }: SessionRef) =>
        update<true>(current => {
          const next = withPortalStarted(
            readNotificationSettings(current),
            installation,
            sessionId,
            Date.now(),
          );
          return next && { value: next, result: true };
        }),
      event: null,
      untrackedReason:
        'Part of starting a session, which reports AgentPlatform.sessionStarted.',
    },
    storedSettingWriteClient,
  );
  return useCallback(
    async (installation: string, sessionId: string) => {
      await mutateAsync({ installation, sessionId });
    },
    [mutateAsync],
  );
}

/**
 * What the person has seen in the Notification inbox: per session, and per
 * installation for its MCP sign-in row, the mark of the last row seen
 * (`agent-platform` bucket, key `notificationSeenMarks`, see
 * `lib/notificationRecord`). A mark is opaque here: the inbox builds it (its
 * row identity) and compares it. Roams like the settings, and is read again
 * when the tab becomes visible.
 *
 * `isKnown` stays false until the stored marks have been read; until then
 * nothing reads as seen.
 */
export function useNotificationSeenMarks() {
  const { snapshot, update } = useStoredSetting(
    NOTIFICATION_SEEN_KEY,
    RECORD_OPTIONS,
  );
  const seen = useMemo(
    () =>
      readNotificationSeen(
        snapshot.presence === 'present' ? snapshot.value : undefined,
      ),
    [snapshot],
  );

  const sessionSeenMarkOf = useCallback(
    (installation: string, sessionId: string) =>
      sessionSeenMarkOfIn(seen, installation, sessionId),
    [seen],
  );
  const mcpSignInSeenMarkOf = useCallback(
    (installation: string) => mcpSignInSeenMarkOfIn(seen, installation),
    [seen],
  );
  const isSeen = useCallback(
    (target: SeenMarkTarget) => isSeenIn(seen, target),
    [seen],
  );

  const { mutateAsync } = useTrackedMutation(
    {
      mutationFn: ({ targets }: SeenMarksWrite) =>
        update<true>(current => {
          const next = withSeen(
            readNotificationSeen(current),
            targets,
            Date.now(),
          );
          return next && { value: next, result: true };
        }),
      // Only what the person did: a row opened from the inbox, "Mark all
      // read". A session's row marked seen because its page is on screen is
      // bookkeeping, reported by nothing.
      event: (_, { reason }) => {
        if (reason?.action === 'markedAllRead') {
          return {
            name: 'AgentPlatform.notificationsMarkedRead',
            attributes: {},
          };
        }
        if (reason?.action === 'opened') {
          return {
            name: 'AgentPlatform.notificationOpened',
            attributes: { kind: reason.kind },
          };
        }
        return null;
      },
    },
    storedSettingWriteClient,
  );

  /**
   * Marks one row seen. `reason` reports the person's own action (opening
   * the row); without it the write is not reported.
   */
  const markSeen = useCallback(
    async (target: SeenMarkTarget, reason?: SeenMarkReason) => {
      await mutateAsync({ targets: [target], reason });
    },
    [mutateAsync],
  );

  /** Marks every row seen in one write: "Mark all read". */
  const markManySeen = useCallback(
    async (targets: readonly SeenMarkTarget[], reason?: SeenMarkReason) => {
      await mutateAsync({ targets, reason });
    },
    [mutateAsync],
  );

  const isKnown = snapshot.presence !== 'unknown';
  return useMemo(
    () => ({
      isKnown,
      sessionSeenMarkOf,
      mcpSignInSeenMarkOf,
      isSeen,
      markSeen,
      markManySeen,
    }),
    [
      isKnown,
      sessionSeenMarkOf,
      mcpSignInSeenMarkOf,
      isSeen,
      markSeen,
      markManySeen,
    ],
  );
}

/**
 * The whole notification record, for the Notification inbox: the settings
 * and the seen marks together. See {@link useSessionNotificationSettings} and
 * {@link useNotificationSeenMarks}.
 */
export function useSessionNotificationRecord() {
  const settings = useSessionNotificationSettings();
  const seen = useNotificationSeenMarks();
  return useMemo(
    () => ({
      ...settings,
      ...seen,
      isKnown: settings.isKnown && seen.isKnown,
    }),
    [settings, seen],
  );
}

/** One installation to prune the record for. */
export type PruneRequest = {
  installation: string;
  /** The sessions a list already read lists there: what to compare with. */
  listedSessionIds: readonly string[];
  /**
   * Reads the installation's sessions afresh, resolving undefined unless the
   * read is complete (`KagentApi.listSessionsIfComplete`).
   */
  readComplete: () => Promise<readonly KagentSession[] | undefined>;
};

/**
 * Drops the record's entries for sessions that no longer exist, one
 * installation at a time; resolves whether a complete read was made.
 *
 * Nothing is written, and no session is read, unless the record holds an
 * entry for a session `listedSessionIds` does not list. Then the record is
 * read, the installation's sessions are read completely after it, and only
 * the entries that were in the record before that read and that it does not
 * list are dropped (see `PruneInput`): no clock decides, and a read that is
 * not complete prunes nothing.
 */
export function useNotificationRecordPruning() {
  const updateSettings = useStoredSettingUpdate(NOTIFICATION_SETTINGS_KEY);
  const updateSeen = useStoredSettingUpdate(NOTIFICATION_SEEN_KEY);

  const { mutateAsync } = useTrackedMutation(
    {
      mutationFn: async ({
        installation,
        listedSessionIds,
        readComplete,
      }: PruneRequest) => {
        // What the record holds for the installation, read fresh; nothing is
        // written.
        const knownSettings = new Set<string>();
        const knownSeen = new Set<string>();
        await updateSettings(current => {
          const { sessions } = readNotificationSettings(current);
          sessionKeysOf(sessions, installation).forEach(key =>
            knownSettings.add(key),
          );
          return undefined;
        });
        await updateSeen(current => {
          const { sessions } = readNotificationSeen(current);
          sessionKeysOf(sessions, installation).forEach(key =>
            knownSeen.add(key),
          );
          return undefined;
        });
        const listed = new Set(
          listedSessionIds.map(id => sessionKey(installation, id)),
        );
        if (![...knownSettings, ...knownSeen].some(key => !listed.has(key))) {
          return false;
        }

        const live = await readComplete();
        if (!live) {
          return true;
        }
        const liveSessionIds = live.map(session => session.sessionId);
        await updateSettings<true>(current => {
          const next = prunedSettings(readNotificationSettings(current), {
            installation,
            known: knownSettings,
            liveSessionIds,
          });
          return next && { value: next, result: true };
        });
        await updateSeen<true>(current => {
          const next = prunedSeen(readNotificationSeen(current), {
            installation,
            known: knownSeen,
            liveSessionIds,
          });
          return next && { value: next, result: true };
        });
        return true;
      },
      event: null,
      untrackedReason:
        'Housekeeping of the stored record after sessions were deleted, not an action of the person.',
    },
    storedSettingWriteClient,
  );

  return useCallback(
    (request: PruneRequest): Promise<boolean> => mutateAsync(request),
    [mutateAsync],
  );
}
