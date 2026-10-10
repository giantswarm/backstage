import { Flex, Text } from '@backstage/ui';
import {
  Agent,
  AgentFailure,
  isGitOpsManaged,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { GitOpsCard } from '@giantswarm/backstage-plugin-flux-react';
import {
  CopyButton,
  type Fact,
  FactList,
  InfoCard,
} from '@giantswarm/backstage-plugin-ui-react';

import type { ClientServingSummary } from '../../lib/serving';
import { AgentConfigurationCard } from './AgentConfigurationCard';
import { AgentStatusCard } from './AgentStatusCard';
import { shortPin, skillLabel } from './helpers';

/** Identifiers someone may retype into `kubectl`. */
const MONO: React.CSSProperties = {
  fontFamily: 'monospace',
  overflowWrap: 'anywhere',
};

function Mono({ children }: { children: string }) {
  return (
    <Text variant="body-small" style={MONO}>
      {children}
    </Text>
  );
}

/**
 * The resource behind the agent, in the terms of the people who run the
 * platform: what it is called in the cluster, the Harness it runs on, the
 * revision it runs, where its instructions are read from and which version of
 * each skill it is pinned to.
 */
function ResourceFacts({ agent }: { agent: Agent }) {
  const namespace = agent.getNamespace();
  const name = agent.getName();
  const harness = agent.getHarnessName();
  const revision = agent.getLatestSuccessfulRevision();
  const source = agent.getSystemMessageSource();
  const skills = agent.getSkills();

  const facts: Fact[] = [
    {
      label: 'Agent',
      value: <Mono>{namespace ? `${namespace}/${name}` : name}</Mono>,
    },
  ];
  if (harness) {
    facts.push({ label: 'Harness', value: <Mono>{harness}</Mono> });
  }
  if (revision) {
    facts.push({
      label: 'Revision',
      value: (
        <span title={revision}>
          <Mono>{shortPin(revision)}</Mono>
        </span>
      ),
    });
  }
  if (source) {
    facts.push({
      label: 'Instructions from',
      value: <Mono>{`ConfigMap ${source.name}, key ${source.key}`}</Mono>,
    });
  }
  if (skills.length > 0) {
    facts.push({
      label: 'Skill versions',
      value: (
        <Flex direction="column" gap="1">
          {skills.map((skill, index) => (
            <Text
              key={`${skill.url}#${skill.path ?? ''}#${index}`}
              variant="body-small"
            >
              {skillLabel(skill)} at{' '}
              <span style={MONO} title={skill.pin}>
                {shortPin(skill.pin)}
              </span>
            </Text>
          ))}
        </Flex>
      ),
    });
  }

  const instructions = agent.getSystemMessage();

  return (
    <InfoCard
      title="Resource"
      headerActions={
        instructions ? (
          <CopyButton
            text={instructions}
            label="Copy system prompt"
            size="compact"
          />
        ) : undefined
      }
    >
      <FactList facts={facts} labelWidth={160} maxWidth={null} />
    </InfoCard>
  );
}

/**
 * The agent as a Kubernetes resource, behind the overview's "Show technical
 * details": where it came from (GitOps, the HelmRelease), how its template is
 * configured, and what the controllers make of it — the cards this page used
 * to lead with.
 */
export function AgentTechnicalDetails({
  agent,
  installation,
  modelConfig,
  modelServing,
  failure,
  toolsHref,
}: {
  agent: Agent;
  installation: string;
  modelConfig: ModelConfig | undefined;
  modelServing: ClientServingSummary | undefined;
  failure: AgentFailure | undefined;
  toolsHref?: string;
}) {
  return (
    <Flex direction="column" gap="4">
      {/* A cheap pre-check only: whether the agent is *actually* applied from
          Git is the card's own decision — see AgentOverviewTab. */}
      {isGitOpsManaged(agent) && (
        <GitOpsCard resource={agent} installationName={installation} />
      )}
      <ResourceFacts agent={agent} />
      {/* Stacked rather than side by side: this sits in the main column,
          beside the facts, where there is no width to divide. */}
      <AgentConfigurationCard
        agent={agent}
        modelConfig={modelConfig}
        modelServing={modelServing}
        failure={failure}
        toolsHref={toolsHref}
      />
      <AgentStatusCard agent={agent} />
    </Flex>
  );
}
