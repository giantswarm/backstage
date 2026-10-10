import { ReactNode, useMemo, useState } from 'react';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Button, Flex, Switch, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  Agent,
  AgentSkill,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  CollapsibleMarkdown,
  DateComponent,
  type Fact,
  SectionHeader,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentToolset } from '../../hooks/useAgentToolset';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import type { ClientServingSummary } from '../../lib/serving';
import {
  canonicalSkillId,
  repoSlug,
  skillDetailPath,
  type DiscoveredSkill,
} from '../../lib/skills';
import { modelDetailRouteRef, skillsRouteRef } from '../../routes';
import { describeReach } from '../AgentReachLine';
import { ModelServingStatus } from '../ModelServingStatus';
import { AgentTechnicalDetails } from './AgentTechnicalDetails';
import { FailureMarker } from './FailureMarker';
import {
  describeToolScope,
  isGatewayServerBinding,
  skillLabel,
} from './helpers';

const useStyles = makeStyles(theme => ({
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(4),
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    // SectionHeader carries a bottom margin meant for a description under
    // it; these sections put their own content there.
    '& h2': { marginBottom: 0 },
  },
  // Readable cards that each open the skill's own page: what it is, in its
  // own words, and where it comes from.
  skillGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: theme.spacing(1.5),
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  skillCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    height: '100%',
    boxSizing: 'border-box',
    padding: theme.spacing(1.5, 2),
    border: '1px solid var(--bui-border-1, #e3ebef)',
    borderRadius: 12,
    background: 'var(--bui-bg-surface-1, #fff)',
    minWidth: 0,
  },
  clamp: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  rows: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
}));

/** A section of the plain overview: a small heading, then what it says. */
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const classes = useStyles();
  return (
    <section className={classes.section} aria-label={title}>
      <div className={classes.sectionHead}>
        <SectionHeader as="h2" variant="title-x-small" title={title} />
        {action}
      </div>
      {children}
    </section>
  );
}

/** The skill as the catalog discovered it, when the catalog has it. */
function useCatalogSkills(): Map<string, DiscoveredSkill> {
  const { skills } = useSkillCatalog();
  return useMemo(
    () => new Map(skills.map(skill => [canonicalSkillId(skill), skill])),
    [skills],
  );
}

/**
 * One mounted skill as a readable card: its name, what it is for in its own
 * words when the skill catalog has it, and where it comes from — opening the
 * skill's own page where there is one (a git skill on github.com).
 */
function SkillCard({
  skill,
  discovered,
}: {
  skill: AgentSkill;
  discovered?: DiscoveredSkill;
}) {
  const classes = useStyles();
  const skillsRoute = useRouteRef(skillsRouteRef);
  const label = discovered?.name || skillLabel(skill);
  const detailPath =
    skill.source === 'git'
      ? skillDetailPath({ repoUrl: skill.url, path: skill.path ?? '' })
      : undefined;
  const href =
    skillsRoute && detailPath ? `${skillsRoute()}/${detailPath}` : undefined;
  const from = skill.source === 'git' ? repoSlug(skill.url) : skill.url;

  return (
    <li className={classes.skillCard}>
      {href ? (
        // core-components' `Link`, which routes client-side.
        <Link to={href}>
          <Text as="span" variant="body-medium" style={{ color: 'inherit' }}>
            {label}
          </Text>
        </Link>
      ) : (
        <Text variant="body-medium">{label}</Text>
      )}
      {discovered?.description && (
        <Text
          variant="body-small"
          color="secondary"
          className={classes.clamp}
          title={discovered.description}
        >
          {discovered.description}
        </Text>
      )}
      <Text
        variant="body-x-small"
        color="secondary"
        style={{ overflowWrap: 'anywhere' }}
      >
        From {from}
      </Text>
    </li>
  );
}

function SkillsSection({
  agent,
  onUpdateSkills,
  onAddSkills,
  isGitOpsOwned,
}: {
  agent: Agent;
  onUpdateSkills?: () => void;
  onAddSkills?: () => void;
  isGitOpsOwned: boolean;
}) {
  const classes = useStyles();
  const skills = agent.getSkills();
  const catalog = useCatalogSkills();

  const action =
    onUpdateSkills && skills.length > 0 ? (
      <Button variant="secondary" size="small" onPress={onUpdateSkills}>
        Update skills…
      </Button>
    ) : undefined;

  return (
    <Section title="Skills" action={action}>
      {skills.length === 0 ? (
        <Flex direction="column" gap="2" align="start">
          <Text variant="body-medium" color="secondary">
            No skills yet. A skill adds know-how and procedures the agent can
            draw on.
          </Text>
          {isGitOpsOwned && (
            <Text variant="body-small" color="secondary">
              {onAddSkills
                ? 'This agent is deployed from a GitOps repository, so adding skills opens a pull request there.'
                : 'This agent is deployed from a GitOps repository, so its skills are added there.'}
            </Text>
          )}
          {onAddSkills && (
            <Button variant="secondary" size="small" onPress={onAddSkills}>
              Add skills
            </Button>
          )}
        </Flex>
      ) : (
        <ul className={classes.skillGrid} aria-label="Skills">
          {skills.map((skill, index) => (
            <SkillCard
              // The same source can be mounted at several paths, so the index
              // is part of the key.
              key={`${skill.url}#${skill.path ?? ''}#${index}`}
              skill={skill}
              discovered={
                skill.source === 'git'
                  ? catalog.get(
                      canonicalSkillId({
                        repoUrl: skill.url,
                        path: skill.path ?? '',
                      }),
                    )
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </Section>
  );
}

/**
 * What the agent can reach, in the words the composer's reach line uses —
 * read from the toolset it declares — with the exact tools one link away.
 * Servers bound directly rather than through the gateway, and agents it calls
 * as tools, follow by name.
 */
function ConnectorsSection({
  agent,
  toolsHref,
  isFailing,
}: {
  agent: Agent;
  toolsHref?: string;
  isFailing: boolean;
}) {
  const classes = useStyles();
  const { declared, isReading, isUnreadable } = useAgentToolset(agent);
  const bindings = agent.getMcpBindings();
  const direct = bindings.filter(
    binding => !isGatewayServerBinding(agent, binding),
  );
  const hasGateway = direct.length < bindings.length;
  const subAgents = agent.getSubAgentBindings();

  let reach: string;
  if (!hasGateway) {
    reach =
      direct.length > 0 || subAgents.length > 0
        ? 'Uses only what is listed below'
        : 'Has no connectors. It works from its instructions and skills alone.';
  } else if (isReading) {
    reach = 'Reading what it can reach…';
  } else {
    reach =
      describeReach(declared) ??
      (isUnreadable
        ? 'What it can reach could not be read.'
        : 'What it can reach is not known.');
  }

  return (
    <Section
      title="Connectors"
      action={
        hasGateway && toolsHref ? (
          <Link to={toolsHref}>See which tools</Link>
        ) : undefined
      }
    >
      <Text variant="body-medium">{reach}</Text>
      {(direct.length > 0 || subAgents.length > 0) && (
        <div className={classes.rows}>
          {direct.map((binding, index) => (
            <Flex
              key={`${binding.server.name}#${index}`}
              direction="column"
              gap="1"
            >
              <Text variant="body-medium">{binding.server.name}</Text>
              <Text variant="body-small" color="secondary">
                {describeToolScope(binding)}
                {binding.requireApproval ? ' · asks you before every call' : ''}
              </Text>
            </Flex>
          ))}
          {subAgents.map(ref => (
            <Flex
              key={`agent/${ref.name}/${ref.templateRef.name}`}
              direction="column"
              gap="1"
            >
              <Text variant="body-medium">{ref.templateRef.name}</Text>
              <Text variant="body-small" color="secondary">
                Another agent it can hand work to
              </Text>
            </Flex>
          ))}
        </div>
      )}
      {isFailing && <FailureMarker />}
    </Section>
  );
}

function InstructionsSection({
  agent,
  isFailing,
}: {
  agent: Agent;
  isFailing: boolean;
}) {
  const instructions = agent.getSystemMessage();
  const source = agent.getSystemMessageSource();

  let body: ReactNode;
  if (instructions) {
    body = (
      <CollapsibleMarkdown
        content={instructions}
        toggleLabels={{
          expand: 'Show all instructions',
          collapse: 'Show less',
        }}
      />
    );
  } else if (source) {
    body = (
      <Text variant="body-medium" color="secondary">
        Kept in a separate configuration, so they are not shown here. Technical
        details below name it.
      </Text>
    );
  } else {
    body = (
      <Text variant="body-medium" color="secondary">
        None set. The agent works with the defaults of its runtime.
      </Text>
    );
  }

  return (
    <Section title="Instructions">
      {body}
      {isFailing && <FailureMarker />}
    </Section>
  );
}

export type AgentPlainOverviewProps = {
  agent: Agent;
  installation: string;
  modelConfig: ModelConfig | undefined;
  modelServing: ClientServingSummary | undefined;
  /** The agent's tools view, which resolves the toolset to exact tools. */
  toolsHref?: string;
  /** Opens Update skills. Absent when the page cannot write the agent. */
  onUpdateSkills?: () => void;
  /** Opens the edit page, where skills are added. Absent when not editable. */
  onAddSkills?: () => void;
  isGitOpsOwned: boolean;
};

/**
 * The agent in plain words, per the prototype's Overview: what it is for, the
 * instructions it follows, the skills it draws on and what it can reach —
 * and, behind a switch, the technical details (where it runs, the
 * controllers' verdict, the HelmRelease behind it), which is where this page
 * used to start.
 *
 * The technical details start shown for an agent that is not ready: the
 * conditions are what explains it then.
 */
export function AgentPlainOverview({
  agent,
  installation,
  modelConfig,
  modelServing,
  toolsHref,
  onUpdateSkills,
  onAddSkills,
  isGitOpsOwned,
}: AgentPlainOverviewProps) {
  const classes = useStyles();
  const failure = agent.getFailure();
  const description = agent.getDescription();
  const [showTechnical, setShowTechnical] = useState(
    agent.getReadiness() !== 'ready',
  );

  return (
    <div className={classes.sections}>
      <Section title="What it’s for">
        {description ? (
          <Text as="p" variant="body-medium" style={{ margin: 0 }}>
            {description}
          </Text>
        ) : (
          <Text as="p" variant="body-medium" color="secondary">
            No description yet.
          </Text>
        )}
      </Section>

      <InstructionsSection
        agent={agent}
        isFailing={failure?.field === 'systemPrompt'}
      />

      <SkillsSection
        agent={agent}
        onUpdateSkills={onUpdateSkills}
        onAddSkills={onAddSkills}
        isGitOpsOwned={isGitOpsOwned}
      />

      <ConnectorsSection
        agent={agent}
        toolsHref={toolsHref}
        isFailing={failure?.field === 'tools'}
      />

      <Flex direction="column" gap="3">
        <Switch
          label="Show technical details"
          isSelected={showTechnical}
          onChange={setShowTechnical}
        />
        {showTechnical && (
          <AgentTechnicalDetails
            agent={agent}
            installation={installation}
            modelConfig={modelConfig}
            modelServing={modelServing}
            failure={failure}
            toolsHref={toolsHref}
          />
        )}
      </Flex>
    </div>
  );
}

/**
 * The model behind the agent, by its friendly name and linked to its page,
 * with the serving layer's word on it where there is one.
 */
function ModelFact({
  agent,
  installation,
  modelConfig,
  modelServing,
  isFailing,
}: {
  agent: Agent;
  installation: string;
  modelConfig?: ModelConfig;
  modelServing?: ClientServingSummary;
  isFailing: boolean;
}) {
  const modelDetailRoute = useRouteRef(modelDetailRouteRef);
  const modelConfigName = agent.getModelConfigName();
  if (!modelConfigName) {
    return isFailing ? <FailureMarker /> : <Text variant="body-small">—</Text>;
  }
  // The friendly name where the ModelConfig carries one, else the model it
  // runs; the resource name only when the ModelConfig cannot be read — which
  // is normal for a non-admin.
  const label =
    modelConfig?.getDisplayNameAnnotation() ??
    modelConfig?.getModel() ??
    modelConfigName;
  const href = modelDetailRoute?.({
    installation,
    namespace: agent.getNamespace() ?? '',
    name: modelConfigName,
  });

  return (
    <Flex direction="column" gap="1">
      {href ? (
        <Link to={href}>
          <Text as="span" variant="body-small" style={{ color: 'inherit' }}>
            {label}
          </Text>
        </Link>
      ) : (
        <Text variant="body-small">{label}</Text>
      )}
      {modelServing && <ModelServingStatus serving={modelServing} />}
      {isFailing && <FailureMarker />}
    </Flex>
  );
}

/** The facts beside the overview: the model, where it runs, since when. */
export function agentFacts({
  agent,
  installation,
  modelConfig,
  modelServing,
}: {
  agent: Agent;
  installation: string;
  modelConfig?: ModelConfig;
  modelServing?: ClientServingSummary;
}): Fact[] {
  const failure = agent.getFailure();
  const created = agent.getCreatedTimestamp();
  const facts: Fact[] = [
    {
      label: 'Model',
      value: (
        <ModelFact
          agent={agent}
          installation={installation}
          modelConfig={modelConfig}
          modelServing={modelServing}
          isFailing={failure?.field === 'model'}
        />
      ),
    },
    { label: 'Environment', value: installation },
  ];
  if (created) {
    facts.push({
      label: 'Created',
      value: (
        <Text variant="body-small">
          <DateComponent value={created} />
        </Text>
      ),
    });
  }
  return facts;
}
