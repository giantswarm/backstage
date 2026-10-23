import { useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useTrackedMutation,
  type PortalEventAttributes,
} from '@giantswarm/backstage-plugin-analytics-react';
import { AgentManagerClient } from '../apis/AgentManagerClient';
import { WorkspaceManagerClient } from '../apis/WorkspaceManagerClient';
import { authorizationError } from '../lib/workspaceManager';
import {
  AgentManagerError,
  AgentManagerNotConnectedError,
} from '../lib/agentManager';
import { tenantInSentence } from '../lib/tenants';
import type { AgentRow } from '../components/AgentsDataProvider';
import { sessionsQueryKey, sessionStatesQueryKey } from '../lib/queryKeys';
import { deriveSessionTitle } from '../lib/sessionTitle';
import { useMusterPluginApi } from './useMusterPluginApi';
import { usePortalStartedRecorder } from './useSessionNotificationRecord';

/** What the composer submits: an agent, and the prompt to open the session with. */
export type NewSession = {
  agent: AgentRow;
  prompt: string;
  /**
   * What to title the session by, when the prompt would title it badly: a
   * prompt the portal wrote opens with its framing, not with the topic.
   * Derived from the prompt when absent.
   */
  title?: string;
  /**
   * The workspace on the agent's installation the session starts in, by
   * name; absent, the plain session.
   */
  workspace?: string;
};

/**
 * One submission of the composer, with the idempotency key it was given.
 *
 * The key is minted **once per submission**, outside the mutation, so every
 * retry of that submission — the mutation's own, or the user pressing Start
 * again on the same prompt after a lost answer — carries the same one and
 * agent-manager answers the same session instead of creating a second.
 */
type NewSessionRequest = NewSession & { requestId: string };

/** Where the person started the session from, as the analytics event says. */
export type SessionEntryPoint =
  PortalEventAttributes<'AgentPlatform.sessionStarted'>['entryPoint'];

export type UseCreateSessionOptions = {
  /** Passed to `deriveSessionTitle`; its default applies when absent. */
  titleMaxLength?: number;
};

/**
 * The controller's refusal of a session (`PermissionDenied`, which
 * agent-manager answers as `forbidden: kagent: …`) said as a refusal that
 * names the agent's tenant, not as a generic failure: the person may not use
 * that tenant's agents. Any other error as it is, a `forbidden` of another
 * origin (muster refusing the sandbox bind) included.
 */
function refusalNamingTenant(error: unknown, agent: AgentRow): unknown {
  if (
    !(error instanceof AgentManagerError) ||
    error.code !== 'forbidden' ||
    !error.message.startsWith('kagent:')
  ) {
    return error;
  }
  return new AgentManagerError(
    'forbidden',
    `You may not start a session with ${agent.name}: it belongs to ${tenantInSentence(
      agent.namespace,
    )}, and you have no access to its agents on ${agent.installation}. Ask your platform team for the agent-platform:user role in its namespace. (${error.message})`,
  );
}

/**
 * Start a session with an agent: agent-manager's `start_session`, through
 * muster as the person, without a message — it creates the Session only.
 *
 * It is the only way a session starts, on every entry point, so every surface
 * passes the same checks. **Creating it says nothing to the agent.** The
 * prompt is sent separately, as an A2A turn on the new session: the session
 * detail page, which the caller navigates to with the prompt in hand, sends
 * it streamed and with the human-in-the-loop extension requested, as every
 * reply. See "Starting a session" in docs/agent-platform.md for why it is
 * split that way rather than done here.
 *
 * The installation is not a parameter: an agent's identity *is*
 * installation/namespace/name, so picking the agent picks the installation, and
 * taking both would let them disagree.
 *
 * A started session is recorded as **portal-started** in the person's
 * notification record (`usePortalStartedRecorder`): kagent's Session
 * names no surface that started it, so the portal says so itself, and the
 * Notification inbox reports a portal-started session's failures and
 * finished turns, which a session started from Slack reports in Slack.
 *
 * The title is derived here rather than by the caller so every entry point —
 * the sessions list, the agent detail page and the session detail page —
 * produces the same one; `entryPoint` only says which one it was.
 */
export function useCreateSession(
  entryPoint: SessionEntryPoint,
  { titleMaxLength }: UseCreateSessionOptions = {},
) {
  const musterApi = useMusterPluginApi();
  const queryClient = useQueryClient();
  const markPortalStarted = usePortalStartedRecorder();

  const mutation = useTrackedMutation({
    event: (_result, { workspace }: NewSessionRequest) => ({
      name: 'AgentPlatform.sessionStarted',
      attributes: { entryPoint, workspace: workspace ? 'picked' : 'none' },
    }),
    mutationFn: async ({
      agent,
      prompt,
      title,
      workspace,
      requestId,
    }: NewSessionRequest) => {
      if (!musterApi) {
        // agent-manager is reached through muster only; a portal without the
        // muster plugin has no way to start a session.
        throw new AgentManagerNotConnectedError(
          'agent-manager is reached through muster, and the muster plugin is not installed in this portal.',
        );
      }
      // kagent never titles a session, so one started untitled stays that way
      // in every list: a prompt with nothing to title it by starts nothing.
      const sessionName = deriveSessionTitle(title ?? prompt, titleMaxLength);
      if (!sessionName) {
        throw new Error('A session starts with a prompt; this one is empty.');
      }
      // The access check comes first and as the person: kagent admits a
      // Session on a workspace only with the grant it returns, which is
      // passed on and never kept. Refused or connect_required is thrown as
      // the error the composer shows.
      let workspaceGrant: string | undefined;
      if (workspace) {
        const authorization = await new WorkspaceManagerClient(
          musterApi,
          agent.installation,
        ).authorizeWorkspace(workspace);
        const refusal = authorizationError(authorization);
        if (refusal) {
          throw refusal;
        }
        workspaceGrant = authorization.grant;
      }
      try {
        const { sessionId } = await new AgentManagerClient(
          musterApi,
          agent.installation,
        ).startSession({
          // The agent's *technical* name, the `Agent` object's name. `name` is
          // the display annotation and would not match anything.
          namespace: agent.namespace,
          name: agent.technicalName,
          requestId,
          sessionName,
          workspaceGrant,
        });
        return { sessionId };
      } catch (error) {
        throw refusalNamingTenant(error, agent);
      }
    },
    onSuccess: ({ sessionId }, { agent }) => {
      // Not awaited either. A lost write costs only the session's failure and
      // finished-turn notifications, never the start of the session.
      markPortalStarted(agent.installation, sessionId).catch(() => {});
      // With the default `refetchType: 'active'`, so observers that stay
      // mounted through the navigation — the shell rail's session history is
      // the one that matters — re-read at once instead of waiting out their
      // poll interval: a session started anywhere appears in the rail
      // immediately. Deliberately not awaited (and not returned), so landing
      // on the new conversation never waits on a fleet-wide list refetch.
      queryClient.invalidateQueries({
        queryKey: sessionsQueryKey(agent.installation),
      });
      // The rail joins the list with the derived states; without this the new
      // row would sit ungrouped/unmarked until the states' next poll.
      queryClient.invalidateQueries({
        queryKey: sessionStatesQueryKey(agent.installation),
      });
    },
  });

  const { mutateAsync, reset } = mutation;

  // The key of the submission in flight, or of the last one that failed.
  // Kept so that starting the *same* prompt with the same agent again — the
  // natural retry after a network failure — reuses it, while a different prompt
  // or agent is a new submission with a new key.
  const lastRequest = useRef<NewSessionRequest | undefined>(undefined);

  const createSession = useCallback(
    async (newSession: NewSession) => {
      const previous = lastRequest.current;
      const request: NewSessionRequest =
        previous &&
        previous.agent.id === newSession.agent.id &&
        previous.prompt === newSession.prompt &&
        previous.workspace === newSession.workspace
          ? { ...newSession, requestId: previous.requestId }
          : { ...newSession, requestId: crypto.randomUUID() };
      lastRequest.current = request;
      const { sessionId } = await mutateAsync(request);
      // Started: the next identical prompt is a new conversation, not a retry.
      lastRequest.current = undefined;
      return sessionId;
    },
    [mutateAsync],
  );

  return useMemo(
    () => ({
      createSession,
      isCreating: mutation.isPending,
      error: mutation.error as Error | null,
      reset,
    }),
    [createSession, mutation.isPending, mutation.error, reset],
  );
}

export type UseCreateSessionResult = ReturnType<typeof useCreateSession>;
