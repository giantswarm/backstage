import type { ReactNode } from 'react';
import { Flex, Link, Text } from '@backstage/ui';
import {
  Agent,
  AgentFailure,
  type AgentSkill,
  isGitOpsManaged,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { GitOpsCard } from '@giantswarm/backstage-plugin-flux-react';
import {
  CommitSha,
  type Fact,
  FactList,
  InfoCard,
  MONO,
  Mono,
  namespacedNameFacts,
  useFactTextVariant,
} from '@giantswarm/backstage-plugin-ui-react';

import { useSkillPaths } from '../../hooks/useSkillPaths';
import type { ClientServingSummary } from '../../lib/serving';
import { AgentConfigurationCard } from './AgentConfigurationCard';
import { AgentStatusCard } from './AgentStatusCard';
import { skillLabel } from './helpers';

/** Text at the size of the fact list it is a value in. */
function FactText({ children }: { children: ReactNode }) {
  return <Text variant={useFactTextVariant()}>{children}</Text>;
}

/**
 * One skill the agent is pinned to: its name, opening the skill's page where
 * there is one (a git skill the skills page can address), and the commit or
 * digest it is pinned at.
 */
function SkillVersion({ skill }: { skill: AgentSkill }) {
  const variant = useFactTextVariant();
  const skillPaths = useSkillPaths();
  const label = skillLabel(skill);
  const href =
    skill.source === 'git'
      ? skillPaths.detail({ repoUrl: skill.url, path: skill.path ?? '' })
      : undefined;
  return (
    <FactText>
      {href ? (
        <Link href={href} variant={variant}>
          {label}
        </Link>
      ) : (
        label
      )}{' '}
      at <CommitSha value={skill.pin} style={MONO} />
    </FactText>
  );
}

/**
 * The resource behind the agent, in the terms of the people who run the
 * platform: its namespace and name in the cluster, the Harness it runs on,
 * the revision it runs, where its instructions are read from and which
 * version of each skill it is pinned to. The instructions themselves are the
 * overview's Instructions section, not a copy button here.
 */
function ResourceFacts({ agent }: { agent: Agent }) {
  const harness = agent.getHarnessName();
  const revision = agent.getLatestSuccessfulRevision();
  const source = agent.getSystemMessageSource();
  const skills = agent.getSkills();

  const facts: Fact[] = namespacedNameFacts({
    namespace: agent.getNamespace(),
    name: agent.getName(),
  });
  if (harness) {
    facts.push({ label: 'Harness', value: <Mono>{harness}</Mono> });
  }
  if (revision) {
    facts.push({
      label: 'Revision',
      value: (
        <FactText>
          <CommitSha value={revision} style={MONO} />
        </FactText>
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
            <SkillVersion
              key={`${skill.url}#${skill.path ?? ''}#${index}`}
              skill={skill}
            />
          ))}
        </Flex>
      ),
    });
  }

  return (
    <InfoCard title="Resource">
      <FactList facts={facts} labelWidth={160} maxWidth={null} />
    </InfoCard>
  );
}

/**
 * The agent as a Kubernetes resource, inside the overview's "Technical
 * details" fold-out: where it came from (GitOps, the HelmRelease), how its template is
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
        installation={installation}
        modelConfig={modelConfig}
        modelServing={modelServing}
        failure={failure}
        toolsHref={toolsHref}
      />
      <AgentStatusCard agent={agent} />
    </Flex>
  );
}
