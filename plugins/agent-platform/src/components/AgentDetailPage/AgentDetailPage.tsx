import { ReactNode, useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Content,
  EmptyState,
  Link,
  Progress,
} from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Avatar, Button, Flex, Grid, Text } from '@backstage/ui';
import {
  Agent,
  ErrorsProvider,
  isGitOpsManaged,
  isNotFoundError,
  ModelConfig,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { GitOpsCard } from '@giantswarm/backstage-plugin-flux-react';
import {
  DateComponent,
  StatusLabel,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useAgentSessions } from '../../hooks/useAgentSessions';
import { useCreateSession } from '../../hooks/useCreateSession';
import { useDeleteAgent } from '../../hooks/useDeleteAgent';
import { useLastUsedAgent } from '../../hooks/useLastUsedAgent';
import { NEW_SESSION_STATE_KEY } from '../../hooks/useNewSessionHandoff';
import { AvatarSize } from '../../lib/agentAvatar';
import { clientLookupOf } from '../../lib/serving';
import { agentsRouteRef, sessionDetailRouteRef } from '../../routes';
import {
  AgentRow,
  getAgentRefetchInterval,
  ResolveModelServing,
  toAgentRow,
} from '../AgentsDataProvider';
import { READINESS_PRESENTATION } from '../AgentsTable/readinessStatus';
import { NewSessionDialog } from '../NewSessionDialog';
import { ServingProvider, useServing } from '../ServingProvider';
import { AgentActionsMenu } from './AgentActionsMenu';
import { AgentConfigurationCard } from './AgentConfigurationCard';
import { AgentSessionsCard } from './AgentSessionsCard';
import { AgentSkillsCard } from './AgentSkillsCard';
import { AgentStatusCard } from './AgentStatusCard';
import { AgentSystemPromptCard } from './AgentSystemPromptCard';

/** Matches the list's row avatar: two lines of text, 2× for hi-dpi. */
const AVATAR_SIZE: AvatarSize = 96;

/**
 * Link back to the list.
 *
 * `useRouteRef` returns undefined when the route is not bound — which in practice
 * means the Agent Platform extension is disabled, and then this page isn't
 * rendering either. Rendering nothing is still better than hardcoding the path,
 * which would silently rot if the route moved.
 */
function BackToAgents({ children }: { children: ReactNode }) {
  const agentsRoute = useRouteRef(agentsRouteRef);
  if (!agentsRoute) {
    return null;
  }
  return <Link to={agentsRoute()}>{children}</Link>;
}

function AgentDetailPageContent() {
  const { installation = '', namespace = '', name = '' } = useParams();
  const buildAvatarUrl = useAgentAvatarUrl();

  const {
    resource: agent,
    isLoading,
    error,
    errors,
  } = useResource(
    installation,
    Agent,
    { name, namespace, enableDiscovery: false },
    // Same two tiers as the list: tighten while the agent is converging, relax
    // once it settles or stays broken. This page is where someone watches an
    // agent come up, so the fast tier earns its keep here.
    { refetchInterval: getAgentRefetchInterval },
  );

  // A targeted, namespaced read rather than ModelConfigsProvider's cluster-wide
  // list — that list is admin-only, so reusing it here would deny a non-admin the
  // model name on a page they can otherwise see in full.
  const modelConfigName = agent?.getModelConfigName();
  const { resource: modelConfig } = useResource(
    installation,
    ModelConfig,
    { name: modelConfigName ?? '', namespace, enableDiscovery: false },
    { enabled: Boolean(modelConfigName) },
  );

  // What the serving layer says about the model behind that ModelConfig — the
  // same verdict the Model configs and Agents views show, so "Idle" here is
  // "Idle" there.
  const { servingStateFor } = useServing();
  const resolveServing = useCallback<ResolveModelServing>(
    target => servingStateFor(installation, clientLookupOf(target)),
    [servingStateFor, installation],
  );

  // The row shape the sessions list uses, so this agent's name and avatar resolve
  // identically in both places — and, for the composer, the model's state.
  const agentRow = useMemo(
    () =>
      agent
        ? toAgentRow(agent, modelConfig ? [modelConfig] : [], resolveServing)
        : undefined,
    [agent, modelConfig, resolveServing],
  );
  const sessions = useAgentSessions(installation, namespace, name, agentRow);

  // Called here rather than inside the menu: the menu is rendered in the shared
  // plugin header, which is outside this plugin's `QueryClientProvider`, so its
  // react-query reads and mutation would have no client there.
  const deletion = useDeleteAgent(agent);

  // Starting a session from this page. The dialog itself is rendered in the page
  // body, not in the header: the header slot lives outside this plugin's
  // `QueryClientProvider`, so the create mutation has no client there. The button
  // up there can only flip this flag — the same split the session detail page's
  // rename dialog makes.
  const [isNewSessionOpen, setNewSessionOpen] = useState(false);
  const creation = useCreateSession();
  const { reset: resetCreation } = creation;
  const openNewSession = useCallback(() => {
    // Clear a previous attempt's error, so the dialog does not open still showing
    // it.
    resetCreation();
    setNewSessionOpen(true);
  }, [resetCreation]);

  // Only ever this agent, so the picker confirms the target rather than offering a
  // choice — and this page pays for no fleet-wide Agent query to populate one.
  const composerAgents = useMemo(
    () => (agentRow ? [agentRow] : []),
    [agentRow],
  );
  // Remembered for the sessions list's composer, which defaults to whatever was
  // started last — from either entry point.
  const { rememberAgent } = useLastUsedAgent(composerAgents);

  const navigate = useNavigate();
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const { createSession } = creation;
  const onStartSession = useCallback(
    async (target: AgentRow, prompt: string) => {
      let sessionId: string;
      try {
        sessionId = await createSession({ agent: target, prompt });
      } catch {
        // Left to the dialog, which stays open and renders the hook's `error`
        // beside the prompt the user still has.
        return;
      }

      rememberAgent(target);

      const href = sessionDetailRoute?.({
        installation: target.installation,
        sessionId,
      });
      if (!href) {
        setNewSessionOpen(false);
        return;
      }

      // The prompt travels with the navigation and is sent by the session detail
      // page — see "Starting a session" in docs/agent-platform.md. Navigating
      // unmounts this dialog, which is how it closes.
      navigate(href, {
        state: {
          [NEW_SESSION_STATE_KEY]: {
            text: prompt,
            agentNamespace: target.namespace,
            agentName: target.technicalName,
          },
        },
      });
    },
    [createSession, navigate, rememberAgent, sessionDetailRoute],
  );

  // `agent` is memoized on the fetched JSON, `deletion` is memoized on its own
  // contents, and `openNewSession` is stable, so this element's identity only
  // changes when one of them actually does — which is what keeps the header slot
  // from re-registering (and re-rendering) on every poll.
  //
  // The button is withheld for an agent that is not ready: kagent would accept the
  // session and the turn would then fail at the first message, with the readiness
  // this very page already explains as the reason.
  const actions = useMemo(
    () =>
      agent ? (
        <Flex align="center" gap="2">
          {agentRow?.readiness === 'ready' && (
            <Button variant="primary" onPress={openNewSession}>
              Start a session
            </Button>
          )}
          <AgentActionsMenu agent={agent} deletion={deletion} />
        </Flex>
      ) : null,
    [agent, agentRow?.readiness, deletion, openNewSession],
  );
  useProvidePageHeaderActions(actions);

  // A failed read while an agent is already in hand is reported through the
  // ErrorsProvider notice, not by replacing the page.
  //
  // This page polls every 5 s while an agent converges, and the plugin's query
  // client deliberately does not retry ServiceUnavailableError / Unauthorized /
  // Forbidden. react-query keeps `data` and sets `error` on a failed *refetch*, so
  // reading `error` as "we have nothing" would let one proxy hiccup blank a fully
  // rendered agent until the next successful poll — up to a minute once polling has
  // backed off. The rendered data is still correct; only its freshness is in doubt.
  //
  // Not-found is excluded because it has its own explanation below, and reporting
  // it twice would be noise.
  const reportableErrors = useMemo(
    () => errors.filter(errorInfo => !isNotFoundError(errorInfo)),
    [errors],
  );
  useShowErrors(reportableErrors);

  if (isLoading) {
    return (
      <Content>
        <Progress aria-label="Loading agent" />
      </Content>
    );
  }

  // Every branch below is gated on there being no agent to show. With one in hand
  // the page renders, whatever the last read did.
  if (!agent) {
    // A 404 is an expected outcome here — a stale bookmark, a deleted or renamed
    // agent — so it gets an explanation rather than an error banner. Also covers
    // "kagent isn't installed on this installation", which answers 404 for the CRD.
    if (errors.some(isNotFoundError)) {
      return (
        <Content>
          <EmptyState
            missing="data"
            title="Agent not found"
            description={`No agent named "${name}" exists in namespace "${namespace}" on ${
              installation || 'that installation'
            }. It may have been deleted or renamed, or kagent may not be installed there.`}
            action={<BackToAgents>Back to agents</BackToAgents>}
          />
        </Content>
      );
    }

    return (
      <Content>
        <Flex direction="column" gap="3">
          <Alert
            status="danger"
            title="Could not load this agent"
            description={
              (error as Error | null)?.message ??
              'The installation returned a response we could not read. The agent may still exist.'
            }
          />
          <BackToAgents>Back to agents</BackToAgents>
        </Flex>
      </Content>
    );
  }

  const readiness = READINESS_PRESENTATION[agent.getReadiness()];
  const description = agent.getDescription();
  const created = agent.getCreatedTimestamp();
  const avatarUrl = buildAvatarUrl(installation, name, { size: AVATAR_SIZE });

  return (
    <Content>
      <Flex direction="column" gap="4">
        <Flex direction="column" gap="2">
          <BackToAgents>← Agents</BackToAgents>

          <Flex align="center" gap="3" style={{ flexWrap: 'wrap' }}>
            <Avatar
              size="large"
              purpose="decoration"
              name={agent.getDisplayName()}
              src={avatarUrl ?? ''}
            />
            <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
              <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
                <Text variant="title-medium">{agent.getDisplayName()}</Text>
                {/* Tagged because the derived readiness and the condition it came
                    from share a label ("Ready", "Ready") — this is the derived
                    one, distinct from the entries in the conditions list. */}
                <span data-testid="agent-readiness">
                  <StatusLabel
                    label={readiness.label}
                    intent={readiness.intent}
                    icon={readiness.icon}
                  />
                </span>
              </Flex>

              <Text variant="body-small" color="secondary">
                <span style={{ fontFamily: 'monospace' }}>{name}</span>
                {' · '}
                {installation}
                {namespace ? ` / ${namespace}` : ''}
                {created ? ' · created ' : ''}
                {created ? <DateComponent value={created} relative /> : null}
              </Text>
            </Flex>
          </Flex>

          {description && <Text variant="body-medium">{description}</Text>}
        </Flex>

        {/* A cheap pre-check only: no Flux or Helm marker at all means there is
            nothing to resolve, so skip the lookups entirely. Whether the agent is
            *actually* GitOps-managed is the card's own decision — it walks
            Agent → HelmRelease → Kustomization → GitRepository and renders nothing
            unless that ends in Git. An agent created by this plugin's own flow is
            reconciled by a HelmRelease the scaffolder applied, which is not in Git,
            so it correctly shows no card; the "Deployed by" row above is the whole
            truth about where it came from. */}
        {isGitOpsManaged(agent) && (
          <GitOpsCard resource={agent} installationName={installation} />
        )}

        {/* Status sits in a third of the width, beside the configuration. A
            controller message is prose — a rejected spec can carry several
            hundred words of admission-webhook output — and across the full page
            it runs to line lengths nobody can follow. A narrower column is the
            fix, so the status card is the one thing that does not want the whole
            width.

            The sections below it do, and take it: a skills grid fits three cards
            per row, and the sessions table has four columns to place. One column
            below `lg`, where there is no width to divide. */}
        {/* Document order is the layout order — no `colStart`. Grid's sparse
            auto-placement moves the cursor to the next row whenever an item's
            definite column-start is before the cursor's current column, so
            placing the status in column 3 first and then pinning the
            configuration to column 1 drops the configuration to a second row and
            leaves the top-left of the page empty.

            The consequence is that stacking below `lg` puts the configuration
            above the status. Acceptable: the readiness label is already in the
            page header, so the state is visible before either card. */}
        <Grid.Root columns={{ initial: '1', lg: '3' }} gap="4">
          <Grid.Item colSpan={{ initial: '1', lg: '2' }}>
            <AgentConfigurationCard
              agent={agent}
              modelConfig={modelConfig}
              modelServing={agentRow?.modelServing}
            />
          </Grid.Item>
          <Grid.Item colSpan="1">
            <AgentStatusCard agent={agent} />
          </Grid.Item>
        </Grid.Root>

        <AgentSystemPromptCard agent={agent} />
        <AgentSkillsCard agent={agent} />
        <AgentSessionsCard sessions={sessions} />
      </Flex>

      {/* In the body rather than beside the header button that opens it: the
          header slot renders outside this plugin's `QueryClientProvider`, so the
          create mutation would have no client there. */}
      <NewSessionDialog
        isOpen={isNewSessionOpen}
        onOpenChange={setNewSessionOpen}
        agents={composerAgents}
        defaultAgent={agentRow}
        isStarting={creation.isCreating}
        error={creation.error?.message}
        onStart={onStartSession}
      />
    </Content>
  );
}

/**
 * One kagent agent: what it is, whether it works, and what it has been used for.
 *
 * The agent can be deleted from the header's actions menu. It cannot be edited:
 * an agent's settings are its Helm release's values, so changing one means
 * re-releasing the chart, which this plugin has no write path for yet.
 *
 * What the APUI prototype shows and this deliberately does not, because there is
 * no data behind it: sessions all-time, sessions in the last 30 days, a success
 * rate, and "last activity" across the fleet. kagent keeps no per-agent counters
 * and scopes its session list to the calling user, so any of those would be a
 * number invented from one person's history. Please don't add them speculatively.
 *
 * `ErrorsProvider` is required, not decorative: the shared `GitOpsCard` reports
 * the failures of its Flux lookups through `useShowErrors`, which throws without
 * this context. Every gs details page wraps its content the same way, and it also
 * gives this page the standard retry/dismiss notice for a failed read.
 *
 * `ServingProvider` supplies the serving layer's word on the model behind the
 * agent (the Model row, the composer's warning) from the same query cache the
 * Models tab fills; the Agents tab mounts it at its list, this page at itself.
 */
export function AgentDetailPage() {
  return (
    <ErrorsProvider>
      <ServingProvider>
        <AgentDetailPageContent />
      </ServingProvider>
    </ErrorsProvider>
  );
}
