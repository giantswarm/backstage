import { Text } from '@backstage/ui';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';
import { ExternalLink, InfoCard } from '@giantswarm/backstage-plugin-ui-react';

import { repoSlug } from '../../lib/skills';
import {
  SelectableCardGrid,
  StaticCard,
  useSelectableCardStyles,
} from '../SelectableCard';
import { skillLabel } from './helpers';

type SkillRef = ReturnType<Agent['getSkillRefs']>[number];

/**
 * One mounted skill, in the same card the create flow's skill picker uses — just
 * read-only, so there is no checkbox and nothing to press.
 */
function SkillCard({ skill }: { skill: SkillRef }) {
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
        <ExternalLink href={skill.url}>{repoSlug(skill.url)}</ExternalLink>
        {showPath && (
          <>
            {' · '}
            <span className={classes.code}>{path}</span>
          </>
        )}
      </Text>
      {/* The ref decides *which* version of a skill the agent actually runs, and
          an unpinned one changes under the agent whenever its repository does —
          which is exactly what you want to see when behaviour changed and the
          spec didn't. The picker has no equivalent: it always reads a repo's
          default branch. */}
      <Text variant="body-x-small" color="secondary">
        {skill.ref ? (
          <>
            at <span className={classes.code}>{skill.ref}</span>
          </>
        ) : (
          'default branch (unpinned)'
        )}
      </Text>
    </StaticCard>
  );
}

/**
 * The skills mounted into the agent (`spec.skills.gitRefs`).
 *
 * Each is a path in a Git repository the agent pulls at startup. Presented as the
 * same grid of cards the create flow selects from, so an agent's skills look like
 * the things that were picked.
 */
export function AgentSkillsCard({ agent }: { agent: Agent }) {
  const skills = agent.getSkillRefs();

  return (
    <InfoCard title={`Skills${skills.length > 0 ? ` (${skills.length})` : ''}`}>
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
              // Nothing in a gitRef is guaranteed unique — the same repository can
              // be mounted at several paths, and both `name` and `path` are
              // optional — so the index is part of the key.
              key={`${skill.url}#${skill.path ?? ''}#${index}`}
              skill={skill}
            />
          ))}
        </SelectableCardGrid>
      )}
    </InfoCard>
  );
}
