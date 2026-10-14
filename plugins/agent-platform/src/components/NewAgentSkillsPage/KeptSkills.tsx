import { Button, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { ExternalLink } from '@giantswarm/backstage-plugin-ui-react';

import type { AgentSkillEntry } from '../../lib/agentManager';
import { skillEntryKey } from '../../lib/agentEdit';
import { repoSlug } from '../../lib/skills';
import { shortPin } from '../AgentDetailPage/helpers';
import {
  SelectableCardGrid,
  StaticCard,
  useSelectableCardStyles,
} from '../SelectableCard';

const useStyles = makeStyles(theme => ({
  heading: {
    marginBottom: theme.spacing(1),
  },
  actions: {
    marginTop: theme.spacing(1),
  },
}));

/**
 * Editing only: the agent's skills no configured repository lists — pinned
 * from a repository this portal does not discover, or by OCI digest. Listed so
 * the step shows everything the agent mounts; each stays exactly as pinned
 * unless removed.
 */
export function KeptSkills({
  skills,
  onRemove,
}: {
  skills: AgentSkillEntry[];
  onRemove: (skill: AgentSkillEntry) => void;
}) {
  const classes = useSelectableCardStyles();
  const styles = useStyles();
  if (skills.length === 0) {
    return null;
  }
  return (
    <div>
      <Text
        as="h4"
        weight="bold"
        variant="body-small"
        className={styles.heading}
      >
        Also on this agent
      </Text>
      <SelectableCardGrid
        role="list"
        ariaLabel="Skills from elsewhere"
        minWidth={240}
      >
        {skills.map(skill => (
          <StaticCard key={skillEntryKey(skill)}>
            <Text weight="bold">{skill.name}</Text>
            <Text variant="body-x-small" color="secondary">
              {'git' in skill ? (
                <>
                  <ExternalLink href={skill.git.url}>
                    {repoSlug(skill.git.url)}
                  </ExternalLink>
                  {skill.path && (
                    <>
                      {' · '}
                      <span className={classes.code}>{skill.path}</span>
                    </>
                  )}
                </>
              ) : (
                <span className={classes.code}>{skill.oci}</span>
              )}
            </Text>
            <Text variant="body-x-small" color="secondary">
              pinned at{' '}
              <span className={classes.code}>
                {shortPin('git' in skill ? skill.git.commit : skill.oci)}
              </span>
            </Text>
            <div className={styles.actions}>
              <Button
                variant="tertiary"
                size="small"
                aria-label={`Remove skill ${skill.name}`}
                onPress={() => onRemove(skill)}
              >
                Remove
              </Button>
            </div>
          </StaticCard>
        ))}
      </SelectableCardGrid>
    </div>
  );
}
