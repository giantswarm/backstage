import { ReactNode, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Content,
  EmptyState,
  Link,
  Progress,
} from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Avatar, Flex, Text } from '@backstage/ui';
import {
  Agent,
  isGitOpsManaged,
  isNotFoundError,
  ModelConfig,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { GitOpsCard } from '@giantswarm/backstage-plugin-flux-react';
import {
  DateComponent,
  StatusLabel,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useAgentSessions } from '../../hooks/useAgentSessions';
import { AvatarSize } from '../../lib/agentAvatar';
import { agentsRouteRef } from '../../routes';
import { getAgentRefetchInterval, toAgentRow } from '../AgentsDataProvider';
import { READINESS_PRESENTATION } from '../AgentsTable/readinessStatus';
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

/**
 * One kagent agent: what it is, whether it works, and what it has been used for.
 *
 * Read-only. kagent agents are deployed from a Helm chart, so editing one means
 * changing the release's values — a write path this plugin does not have yet, and
 * one that has to respect the shared `OCIRepository` a namespace's agents share.
 *
 * What the APUI prototype shows and this deliberately does not, because there is
 * no data behind it: sessions all-time, sessions in the last 30 days, a success
 * rate, and "last activity" across the fleet. kagent keeps no per-agent counters
 * and scopes its session list to the calling user, so any of those would be a
 * number invented from one person's history. Please don't add them speculatively.
 */
export function AgentDetailPage() {
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

  // The row shape the sessions list uses, so this agent's name and avatar resolve
  // identically in both places.
  const agentRow = useMemo(
    () =>
      agent ? toAgentRow(agent, modelConfig ? [modelConfig] : []) : undefined,
    [agent, modelConfig],
  );
  const sessions = useAgentSessions(installation, namespace, name, agentRow);

  // `agent` is memoized on the fetched JSON, so this element's identity only
  // changes when the agent actually does — which is what keeps the header slot
  // from re-registering (and re-rendering) on every poll.
  const actions = useMemo(
    () => (agent ? <AgentActionsMenu agent={agent} /> : null),
    [agent],
  );
  useProvidePageHeaderActions(actions);

  if (isLoading) {
    return (
      <Content>
        <Progress aria-label="Loading agent" />
      </Content>
    );
  }

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

  if (error || !agent) {
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

        {/* Shown whenever a reconciler owns the agent — which for anything created
            through this plugin means a Flux HelmRelease. The card itself walks
            Agent → HelmRelease → Kustomization → GitRepository for the source link
            and omits it when there is no Kustomization, i.e. when the release was
            applied directly rather than committed to Git. Nothing here is a health
            signal: it is provenance, and it is why an agent will be read-only
            wherever write actions are added later. */}
        {isGitOpsManaged(agent) && (
          <GitOpsCard resource={agent} installationName={installation} />
        )}

        <AgentStatusCard agent={agent} />
        <AgentConfigurationCard agent={agent} modelConfig={modelConfig} />
        <AgentSystemPromptCard agent={agent} />
        <AgentSkillsCard agent={agent} />
        <AgentSessionsCard sessions={sessions} />
      </Flex>
    </Content>
  );
}
