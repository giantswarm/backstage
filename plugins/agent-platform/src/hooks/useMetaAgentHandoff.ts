import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import type { MetaAgentRole } from '@giantswarm/backstage-plugin-agent-platform-common';

import type { AgentRow } from '../components/AgentsDataProvider';
import { isStartableAgent } from '../components/NewSessionComposer';
import { sessionDetailRouteRef } from '../routes';
import { useCreateSession, type SessionEntryPoint } from './useCreateSession';
import { useMetaAgent } from './useMetaAgent';
import { NEW_SESSION_STATE_KEY } from './useNewSessionHandoff';

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
 * "Starting a session" in docs/agent-platform.md). The machinery of the skill
 * forms' `SkillCreationAssist` and the skill page's Evaluate, for features
 * that hand over the same way. The start reports
 * `AgentPlatform.sessionStarted` with `entryPoint`.
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

  const start = useCallback(
    async (prompt: string) => {
      if (!agent) {
        return;
      }
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
          },
        },
      });
    },
    [agent, createSession, navigate, sessionDetailRoute],
  );

  return { agent, start, isCreating, error };
}
