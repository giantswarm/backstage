import { Button, Text } from '@backstage/ui';
import {
  Agent,
  AgentSkill,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ExternalLink, InfoCard } from '@giantswarm/backstage-plugin-ui-react';

import { repoSlug } from '../../lib/skills';
import {
  SelectableCardGrid,
  StaticCard,
  useSelectableCardStyles,
} from '../SelectableCard';
import { shortPin, skillLabel } from './helpers';

/** The source, as a link for a git repository and as text for anything else. */
function SkillSource({ skill }: { skill: AgentSkill }) {
  const classes = useSelectableCardStyles();
  if (skill.source === 'git') {
    return <ExternalLink href={skill.url}>{repoSlug(skill.url)}</ExternalLink>;
  }
  return <span className={classes.code}>{skill.url}</span>;
}

/**
 * One mounted skill, in the same card the create flow's skill picker uses — just
 * read-only, so there is no checkbox and nothing to press.
 */
function SkillCard({ skill }: { skill: AgentSkill }) {
  const classes = useSelectableCardStyles();
  const label = skillLabel(skill);
  const path = skill.path ?? '';

  // Show the path only when it adds something the title doesn't already say —
  // the same rule the picker applies.
  const showPath = path !== '' && (path.includes('/') || path !== label);

  return (
    <StaticCard>
      <Text weight="bold">{label}</Text>
      <Text variant="body-x-small" color="secondary">
        <SkillSource skill={skill} />
        {showPath && (
          <>
            {' · '}
            <span className={classes.code}>{path}</span>
          </>
        )}
      </Text>
      {/* The pin decides *which* version of a skill the agent actually runs. On
          API v2 every skill is pinned — a git commit, an OCI digest or an object
          version — so an agent's behaviour never moves under its author; moving
          a skill forward is an explicit act (agent-manager's `refreshSkills`),
          which is why the pin is worth a line of its own. */}
      <Text variant="body-x-small" color="secondary">
        at{' '}
        <span className={classes.code} title={skill.pin}>
          {shortPin(skill.pin)}
        </span>
      </Text>
    </StaticCard>
  );
}

/**
 * The skills mounted into the agent (`spec.skills[]`).
 *
 * Each is a directory in a git repository at one commit, an OCI artifact at one
 * digest, or a bucket object at one version, mounted when the Harness compiles
 * the template. Presented as the same grid of cards the create flow selects
 * from, so an agent's skills look like the things that were picked.
 */
export function AgentSkillsCard({
  agent,
  onUpdateSkills,
}: {
  agent: Agent;
  /**
   * Opens the Update skills dialog — the pins never move on their own; this
   * re-pins every git skill to its repository's default-branch head after a
   * dry run. Absent when the page cannot reach agent-manager.
   */
  onUpdateSkills?: () => void;
}) {
  const skills = agent.getSkills();

  return (
    <InfoCard
      title={`Skills${skills.length > 0 ? ` (${skills.length})` : ''}`}
      headerActions={
        onUpdateSkills && skills.length > 0 ? (
          <Button variant="secondary" size="small" onPress={onUpdateSkills}>
            Update skills…
          </Button>
        ) : undefined
      }
    >
      {skills.length === 0 ? (
        <Text variant="body-medium" color="secondary">
          No skills mounted. The agent works from its system prompt and tools
          alone.
        </Text>
      ) : (
        <SelectableCardGrid
          role="list"
          ariaLabel="Mounted skills"
          minWidth={240}
        >
          {skills.map((skill, index) => (
            <SkillCard
              // Nothing in a skill entry is guaranteed unique — the same source
              // can be mounted at several paths — so the index is part of the key.
              key={`${skill.url}#${skill.path ?? ''}#${index}`}
              skill={skill}
            />
          ))}
        </SelectableCardGrid>
      )}
    </InfoCard>
  );
}
