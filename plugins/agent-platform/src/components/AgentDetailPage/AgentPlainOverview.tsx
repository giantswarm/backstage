import { ReactNode, useMemo } from 'react';
import { Link } from '@backstage/core-components';
import { Badge, Button, Flex, Text } from '@backstage/ui';
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
  PageSection,
  ShowMore,
  TechnicalDetailsFoldOut,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentToolset } from '../../hooks/useAgentToolset';
import { useReachCatalogue } from '../../hooks/useReachCatalogue';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { underlyingModelLine } from '../../hooks/useUnderlyingModel';
import type { ClientServingSummary } from '../../lib/serving';
import {
  canonicalSkillId,
  repoSlug,
  sameCommit,
  type DiscoveredSkill,
} from '../../lib/skills';
import { bindsGateway } from '../../lib/toolset';
import { describeReach, reachNeedsCatalogue } from '../../lib/toolsetReach';
import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import { useSkillPaths } from '../../hooks/useSkillPaths';
import { SKILL_CARDS_SHOWN } from '../CustomizeSkillsPanel';
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
  const skillPaths = useSkillPaths();
  const label = discovered?.name || skillLabel(skill);
  const href =
    skill.source === 'git'
      ? skillPaths.detail({ repoUrl: skill.url, path: skill.path ?? '' })
      : undefined;
  const from = skill.source === 'git' ? repoSlug(skill.url) : skill.url;
  // Behind the catalog's head of the skill's branch — the comparison Skill ›
  // Used by makes, from the catalog this page has read already: no read of
  // its own. Unknown (no catalog entry, no pin) says nothing.
  const isBehind =
    skill.source === 'git' &&
    Boolean(discovered?.commit && skill.pin) &&
    !sameCommit(skill.pin, discovered!.commit);
  const name = href ? (
    // core-components' `Link`, which routes client-side.
    <Link to={href}>
      <Text as="span" variant="body-medium" style={{ color: 'inherit' }}>
        {label}
      </Text>
    </Link>
  ) : (
    <Text variant="body-medium">{label}</Text>
  );

  return (
    <li className={classes.skillCard}>
      {isBehind ? (
        <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
          {name}
          <Badge size="small">Update available</Badge>
        </Flex>
      ) : (
        name
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
        Update all skills to latest…
      </Button>
    ) : undefined;

  return (
    <PageSection title="Skills" action={action}>
      {skills.length === 0 ? (
        <Flex direction="column" gap="2" align="start">
          <Text variant="body-medium" color="secondary">
            No skills yet. Skills add know-how and procedures.
          </Text>
          {isGitOpsOwned && (
            <Text variant="body-small" color="secondary">
              {onAddSkills
                ? 'It is deployed from GitOps, so adding skills opens a pull request there.'
                : 'It is deployed from GitOps, so add skills there.'}
            </Text>
          )}
          {onAddSkills && (
            <Button variant="secondary" size="small" onPress={onAddSkills}>
              Add skills
            </Button>
          )}
        </Flex>
      ) : (
        // A page of cards at a time, at the Customize skills grid's size:
        // an agent may pin many skills, never an unbounded grid.
        <ShowMore items={skills} initial={SKILL_CARDS_SHOWN} noun="skill">
          {visible => (
            <ul className={classes.skillGrid} aria-label="Skills">
              {visible.map((skill, index) => (
                <SkillCard
                  // The same source can be mounted at several paths, so the
                  // index is part of the key.
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
        </ShowMore>
      )}
    </PageSection>
  );
}

/**
 * What the agent can reach, in the words the composer's reach line uses —
 * read from the toolset it declares; the exact tools are the Tools tab.
 * Servers bound directly rather than through the gateway, and agents it calls
 * as tools, follow by name.
 */
function ConnectorsSection({
  agent,
  isFailing,
}: {
  agent: Agent;
  isFailing: boolean;
}) {
  const classes = useStyles();
  const { declared, isReading, isUnreadable } = useAgentToolset(agent);
  const groups = useReachCatalogue(
    agent.cluster,
    reachNeedsCatalogue(declared),
  );
  const direct = agent
    .getMcpBindings()
    .filter(binding => !isGatewayServerBinding(agent, binding));
  const hasGateway = bindsGateway(agent);
  const subAgents = agent.getSubAgentBindings();

  let reach: string;
  if (!hasGateway) {
    reach =
      direct.length > 0 || subAgents.length > 0
        ? 'Uses only what is listed below'
        : 'It has no connectors, only its instructions and skills.';
  } else if (isReading) {
    reach = 'Reading what it can reach…';
  } else {
    reach =
      describeReach(declared, groups) ??
      (isUnreadable
        ? 'What it can reach could not be read.'
        : 'What it can reach is not known.');
  }

  return (
    <PageSection title="Connectors">
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
    </PageSection>
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
        It is kept in a separate configuration, named under Technical details.
      </Text>
    );
  } else {
    body = (
      <Text variant="body-medium" color="secondary">
        Nothing is set, so the runtime's defaults apply.
      </Text>
    );
  }

  return (
    <PageSection title="Instructions">
      {body}
      {isFailing && <FailureMarker />}
    </PageSection>
  );
}

export type AgentPlainOverviewProps = {
  agent: Agent;
  installation: string;
  modelConfig: ModelConfig | undefined;
  modelServing: ClientServingSummary | undefined;
  /** The Tools tab, which resolves the toolset to exact tools. */
  toolsHref?: string;
  /** Opens Update all skills to latest. Absent when the page cannot write the agent. */
  onUpdateSkills?: () => void;
  /** Opens the edit page, where skills are added. Absent when not editable. */
  onAddSkills?: () => void;
  isGitOpsOwned: boolean;
};

/**
 * The agent in plain words, per the prototype's Overview: what it is for, the
 * instructions it follows, the skills it draws on and what it can reach —
 * and, folded in place below them, the technical details (where it runs, the
 * controllers' verdict, the HelmRelease behind it), which is where this page
 * used to start. A fold-out, never a page-wide switch: technical detail opens
 * where it sits, like the create flow's review step.
 *
 * The fold-out starts open for an agent that is not ready: the conditions are
 * what explains it then.
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

  return (
    <div className={classes.sections}>
      <PageSection title="What it’s for">
        {description ? (
          <Text as="p" variant="body-medium" style={{ margin: 0 }}>
            {description}
          </Text>
        ) : (
          <Text as="p" variant="body-medium" color="secondary">
            No description yet.
          </Text>
        )}
      </PageSection>

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

      <ConnectorsSection agent={agent} isFailing={failure?.field === 'tools'} />

      <TechnicalDetailsFoldOut
        defaultExpanded={agent.getReadiness() !== 'ready'}
      >
        <AgentTechnicalDetails
          agent={agent}
          installation={installation}
          modelConfig={modelConfig}
          modelServing={modelServing}
          failure={failure}
          toolsHref={toolsHref}
        />
      </TechnicalDetailsFoldOut>
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
  const { modelDetail: modelDetailRoute } = useCustomizePaths();
  const modelConfigName = agent.getModelConfigName();
  if (!modelConfigName) {
    return isFailing ? <FailureMarker /> : <Text variant="body-small">—</Text>;
  }
  // The ModelConfig's name — its friendly one where it carries one — as in the
  // create flow's "Runs on …": an admin may abstract the model on purpose
  // ("The Cheap One"), so the name stays (PO decision L6). The model it runs
  // is the secondary line below, unless the name already says it; neither
  // when the ModelConfig cannot be read, which is normal for a non-admin.
  const label = modelConfig?.getDisplayName() ?? modelConfigName;
  const underlyingModel =
    modelConfig && modelConfig.getModel() !== label
      ? underlyingModelLine(modelConfig)
      : undefined;
  // The model's page, where the ModelConfig could be read: for a reader who
  // cannot read it (normal for a non-admin), the page could only say so. The
  // ModelConfig sits in the agent's namespace; without one there is no page
  // to resolve either. Plain text in both cases.
  const namespace = agent.getNamespace();
  const href =
    modelConfig && namespace
      ? modelDetailRoute?.({ installation, namespace, name: modelConfigName })
      : undefined;

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
      {underlyingModel && (
        <Text
          variant="body-x-small"
          color="secondary"
          style={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}
        >
          {underlyingModel}
        </Text>
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
