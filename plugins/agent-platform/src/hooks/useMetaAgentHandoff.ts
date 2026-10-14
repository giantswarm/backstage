import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  MESSAGE_TEXT_MAX_LENGTH,
  type MetaAgentRole,
} from '@giantswarm/backstage-plugin-agent-platform-common';

import type { AgentRow } from '../components/AgentsDataProvider';
import { isStartableAgent } from '../components/NewSessionComposer';
import { sessionDetailRouteRef } from '../routes';
import { useCreateSession, type SessionEntryPoint } from './useCreateSession';
import { useMetaAgent } from './useMetaAgent';
import {
  NEW_SESSION_STATE_KEY,
  type NewSessionHandoff,
} from './useNewSessionHandoff';

export type MetaAgentHandoff = {
  /**
   * The agent serving the role, only once it resolves and can take a
   * session; undefined otherwise — the feature renders nothing then.
   */
  agent?: AgentRow;
  /** Starts a session with the agent and opens it, `prompt` first. */
  start: (prompt: string) => Promise<void>;
  isCreating: boolean;
  error: Error | null;
};

/**
 * A hand-off to a meta agent (decision G13): one press creates a session with
 * the agent serving `role` and opens it, the prompt travelling with the
 * navigation as its first message — the session detail page sends it (see
 * "Starting a session" in docs/agent-platform.md), marked `prepared` so the
 * session page captions it as the portal's, not the person's. The machinery
 * of every "<verb> with X" hand-off (`MetaAgentBanner`'s naming contract). The start reports
 * `AgentPlatform.sessionStarted` with `entryPoint`.
 *
 * A prompt longer than a message may be (`MESSAGE_TEXT_MAX_LENGTH`) is refused
 * before anything is created, through `error`, so the person stays on the form
 * with what they typed (R2-7): created first, the session would open with its
 * first message refused.
 *
 * Reads `useAgents`, so it must be called under an `AgentsDataProvider`.
 */
export function useMetaAgentHandoff(
  role: MetaAgentRole,
  entryPoint: SessionEntryPoint,
): MetaAgentHandoff {
  const resolved = useMetaAgent(role);
  const agent = resolved && isStartableAgent(resolved) ? resolved : undefined;
  const navigate = useNavigate();
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const { createSession, isCreating, error } = useCreateSession(entryPoint);
  const [refusal, setRefusal] = useState<Error | null>(null);

  const start = useCallback(
    async (prompt: string) => {
      if (!agent) {
        return;
      }
      if (prompt.length > MESSAGE_TEXT_MAX_LENGTH) {
        setRefusal(
          new Error(
            `What you typed is too large to carry into a session: it needs ${prompt.length.toLocaleString(
              'en-US',
            )} characters, and a message may hold ${MESSAGE_TEXT_MAX_LENGTH.toLocaleString(
              'en-US',
            )}.`,
          ),
        );
        return;
      }
      setRefusal(null);
      let sessionId: string;
      try {
        sessionId = await createSession({ agent, prompt });
      } catch {
        // Shown by the caller from `error`.
        return;
      }
      const href = sessionDetailRoute?.({
        installation: agent.installation,
        sessionId,
      });
      if (!href) {
        return;
      }
      navigate(href, {
        state: {
          [NEW_SESSION_STATE_KEY]: {
            text: prompt,
            agentNamespace: agent.namespace,
            agentName: agent.technicalName,
            prepared: true,
          } satisfies NewSessionHandoff,
        },
      });
    },
    [agent, createSession, navigate, sessionDetailRoute],
  );

  return { agent, start, isCreating, error: refusal ?? error };
}
