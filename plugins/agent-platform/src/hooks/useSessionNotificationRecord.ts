import { useCallback, useMemo } from 'react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

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
  sessionSeenMarkOf as sessionSeenMarkOfIn,
  withLevel,
  withPortalStarted,
  withSeen,
  type CompleteSessionsRead,
  type NotificationLevel,
  type SeenMarkTarget,
} from '../lib/notificationRecord';
import { storedSettingWriteClient, useStoredSetting } from './useStoredSetting';

/** Both keys are read again whenever the tab becomes visible. */
const RECORD_OPTIONS = { rereadWhenVisible: true };

type SessionRef = { installation: string; sessionId: string };

/**
 * The person's notification settings per session — whether the portal
 * started it, and its Notification level — from the `agent-platform` bucket
 * (key `sessionNotificationSettings`, see `lib/notificationRecord`). Roams
 * across tabs and devices with the app's user-settings storage; every mounted
 * instance follows a change written anywhere.
 *
 * `isKnown` stays false until the stored value has been read: until then
 * every session reads as `default` and not portal-started, which a caller
 * that acts on the difference (the inbox) should wait out.
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

  const { mutateAsync: writePortalStarted } = useTrackedMutation(
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

  /** Records that the portal's `start_session` started the session. */
  const markPortalStarted = useCallback(
    async (installation: string, sessionId: string) => {
      await writePortalStarted({ installation, sessionId });
    },
    [writePortalStarted],
  );

  return {
    isKnown: snapshot.presence !== 'unknown',
    levelOf,
    isPortalStarted,
    setLevel,
    markPortalStarted,
  };
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
      mutationFn: (targets: readonly SeenMarkTarget[]) =>
        update<true>(current => {
          const next = withSeen(
            readNotificationSeen(current),
            targets,
            Date.now(),
          );
          return next && { value: next, result: true };
        }),
      event: null,
      untrackedReason:
        'Bookkeeping of what the person has seen; the inbox reports the actions that lead to it.',
    },
    storedSettingWriteClient,
  );

  /** Marks one row seen. */
  const markSeen = useCallback(
    async (target: SeenMarkTarget) => {
      await mutateAsync([target]);
    },
    [mutateAsync],
  );

  /** Marks every row seen in one write: "Mark all read". */
  const markManySeen = useCallback(
    async (targets: readonly SeenMarkTarget[]) => {
      await mutateAsync(targets);
    },
    [mutateAsync],
  );

  return {
    isKnown: snapshot.presence !== 'unknown',
    sessionSeenMarkOf,
    mcpSignInSeenMarkOf,
    isSeen,
    markSeen,
    markManySeen,
  };
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

/**
 * Drops the record's entries for sessions that no longer exist, against one
 * installation's **complete, successful** sessions read (a failed or partial
 * read must never be passed). Both keys are written only when something is
 * pruned.
 */
export function useNotificationRecordPruning() {
  const { update: updateSettings } = useStoredSetting(
    NOTIFICATION_SETTINGS_KEY,
  );
  const { update: updateSeen } = useStoredSetting(NOTIFICATION_SEEN_KEY);

  const { mutateAsync } = useTrackedMutation(
    {
      mutationFn: async (read: CompleteSessionsRead) => {
        await updateSettings<true>(current => {
          const next = prunedSettings(readNotificationSettings(current), read);
          return next && { value: next, result: true };
        });
        await updateSeen<true>(current => {
          const next = prunedSeen(readNotificationSeen(current), read);
          return next && { value: next, result: true };
        });
      },
      event: null,
      untrackedReason:
        'Housekeeping of the stored record after sessions were deleted, not an action of the person.',
    },
    storedSettingWriteClient,
  );

  return useCallback(
    async (read: CompleteSessionsRead) => {
      await mutateAsync(read);
    },
    [mutateAsync],
  );
}
