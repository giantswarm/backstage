import { useCallback, useRef } from 'react';
import { toastApiRef, useApi } from '@backstage/frontend-plugin-api';
import { formatCount } from '@giantswarm/backstage-plugin-agent-platform-common';

import { kagentApiRef } from '../apis';
import { saveFile } from '../lib/saveFile';
import {
  buildSessionExport,
  SessionTooLongError,
  sessionExportFileName,
} from '../lib/sessionExport';

/** Long enough to read one line, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

const FAILURE_TITLE = 'Could not export the session';

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
 * Not react-query: an export is a snapshot read once on request and never
 * cached, and the menu renders outside the plugin's `QueryClientProvider`.
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
      const bodies = await kagentApi.getRawSession(installation, sessionId);
      const sessionExport = buildSessionExport(
        bodies,
        installation,
        new Date(),
      );
      saveFile(
        JSON.stringify(sessionExport, null, 2),
        sessionExportFileName(agentName, sessionId),
        'application/json',
      );
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
  }, [kagentApi, toastApi, installation, sessionId, agentName]);
}

/** Why an export saved no file, in the person's words. */
function describeExportFailure(error: unknown): string {
  if (error instanceof SessionTooLongError) {
    return `This session has ${formatCount(
      error.totalSize,
    )} turns, too many to export here. To export all of it, use agent-manager’s get_session tool with detail: full.`;
  }
  const name = (error as Error | undefined)?.name;
  // The session read is first, so a session that is not the person's answers
  // 404 there. A 403 can only come from the tasks read, of a session that
  // went away between the two reads: the same "not found" to the person.
  if (name === 'NotFoundError' || name === 'ForbiddenError') {
    return 'The session no longer exists, or it belongs to someone else.';
  }
  return (
    (error as Error | undefined)?.message || 'The session could not be read.'
  );
}
