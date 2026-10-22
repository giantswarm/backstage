import { useCallback, useRef } from 'react';
import { toastApiRef, useApi } from '@backstage/frontend-plugin-api';
import { QueryClient } from '@tanstack/react-query';
import { saveFile } from '@giantswarm/backstage-plugin-ui-react';
import { formatCount } from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  useTrackedMutation,
  type PortalEventAttributes,
} from '@giantswarm/backstage-plugin-analytics-react';

import { kagentApiRef } from '../apis';
import {
  describeReadFailure,
  type KagentRequestErrorFields,
} from '../lib/readFailure';
import {
  buildSessionExport,
  SessionExportError,
  SessionTooLongError,
  sessionExportFileName,
} from '../lib/sessionExport';

/** Long enough to read one line, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

const FAILURE_TITLE = 'Could not export the session';

/**
 * The client the export's `useTrackedMutation` runs on: the hook is called
 * for the shared header's menu, outside the plugin's `QueryClientProvider`,
 * and an export keeps nothing to cache.
 */
const sessionExportClient = new QueryClient({
  defaultOptions: { mutations: { gcTime: 0, retry: false } },
});

type ExportedTasks =
  PortalEventAttributes<'AgentPlatform.sessionExported'>['tasks'];

/**
 * How many tasks an export held, in the event's coarse buckets: how long the
 * sessions people export are, and nothing that could name one.
 */
export function exportedTasksBucket(count: number): ExportedTasks {
  if (count === 0) {
    return '0';
  }
  if (count < 10) {
    return '1-9';
  }
  return count < 100 ? '10-99' : '100+';
}

/** The session an export is of, as the session page knows it. */
export type SessionExportTarget = {
  installation: string;
  sessionId: string;
  /** The agent's name, for the file name; absent when no agent matched. */
  agentName?: string;
};

/**
 * Exports a session to a file, the session actions menu's Export session.
 *
 * A mutation only to report `AgentPlatform.sessionExported` once a file is
 * saved: the read is a snapshot made on request, cached nowhere.
 *
 * Complete or nothing: a failed read, or a session longer than the portal
 * reads, says so in a toast and saves no file. Running while a turn is in
 * flight is allowed, and the file shows the turn as kagent had it.
 */
export function useExportSession({
  installation,
  sessionId,
  agentName,
}: SessionExportTarget): () => Promise<void> {
  const kagentApi = useApi(kagentApiRef);
  const toastApi = useApi(toastApiRef);
  // A second press while the first export still reads would save the
  // session twice.
  const inFlight = useRef(false);

  const { mutateAsync } = useTrackedMutation(
    {
      mutationFn: async () => {
        const bodies = await kagentApi.getRawSession(installation, sessionId);
        const sessionExport = buildSessionExport(
          bodies,
          installation,
          new Date(),
        );
        // Unindented: a session with images runs to megabytes, and readers
        // parse the file rather than read it.
        saveFile(
          JSON.stringify(sessionExport),
          sessionExportFileName(agentName, sessionId),
          'application/json',
        );
        return sessionExport.tasks.length;
      },
      event: taskCount => ({
        name: 'AgentPlatform.sessionExported',
        attributes: { tasks: exportedTasksBucket(taskCount) },
      }),
    },
    sessionExportClient,
  );

  return useCallback(async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    // A long session is a few seconds of reading, and the menu has closed.
    const progress = toastApi.post({
      title: 'Exporting the session…',
      status: 'info',
    });
    try {
      await mutateAsync();
      toastApi.post({
        title: 'Session exported',
        status: 'success',
        timeout: TOAST_TIMEOUT_MS,
      });
    } catch (error) {
      // Failures stay until closed: the too-long one carries the way out,
      // and none of them is an acknowledgement to let go of.
      toastApi.post({
        title: FAILURE_TITLE,
        description: describeExportFailure(error),
        status: 'danger',
      });
    } finally {
      progress?.close();
      inFlight.current = false;
    }
  }, [mutateAsync, toastApi]);
}

/** Why an export saved no file, in the person's words. */
function describeExportFailure(error: unknown): string {
  if (error instanceof SessionTooLongError) {
    const count =
      error.totalSize === undefined
        ? 'more turns'
        : `${formatCount(error.totalSize)} turns, more`;
    return `This session has ${count} than the portal can export at once. To export all of it, use agent-manager’s get_session tool with detail: full.`;
  }
  if (error instanceof SessionExportError) {
    return error.message;
  }
  // Only a 404 is a missing session: the session read goes first, and kagent
  // answers it 404 for a session that is someone else's too. A 400 the
  // client also names NotFoundError, and a 403 from the gateway, are not.
  if ((error as KagentRequestErrorFields | undefined)?.status === 404) {
    return 'The session no longer exists, or it belongs to someone else.';
  }
  const { reason, requestId } = describeReadFailure(error);
  return `The session could not be read: ${reason}${
    requestId ? `, request id ${requestId}` : ''
  }.`;
}
