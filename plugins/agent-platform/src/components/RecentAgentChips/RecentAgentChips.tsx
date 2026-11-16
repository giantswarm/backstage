import { useId } from 'react';
import { Button, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import type { AgentRow } from '../AgentsDataProvider';
import { AgentAvatar } from '../AgentAvatar';

export type RecentAgentChipsProps = {
  /** In display order; see `recentAgents`. */
  agents: AgentRow[];
  onPick: (agent: AgentRow) => void;
};

const useStyles = makeStyles({
  // A long name ends in an ellipsis inside the column, its full text on
  // hover: centred, the label and the row would otherwise size to the
  // longest name.
  fit: {
    maxWidth: '100%',
  },
  chip: {
    minWidth: 0,
    maxWidth: '100%',
  },
  name: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

/** The agents of the person's latest sessions, one press from being chosen. */
export function RecentAgentChips({ agents, onPick }: RecentAgentChipsProps) {
  const classes = useStyles();
  const labelId = useId();
  const buildAvatarUrl = useAgentAvatarUrl();

  if (agents.length === 0) {
    return null;
  }

  return (
    <Flex direction="column" align="center" gap="2" className={classes.fit}>
      <Text id={labelId} variant="body-small" color="secondary">
        Or pick one of your recent agents
      </Text>
      <Flex
        role="group"
        aria-labelledby={labelId}
        justify="center"
        gap="2"
        className={classes.fit}
        style={{ flexWrap: 'wrap' }}
      >
        {agents.map(agent => (
          <Button
            key={agent.id}
            variant="secondary"
            size="small"
            iconStart={
              <AgentAvatar
                size="x-small"
                purpose="decoration"
                name={agent.name}
                src={
                  buildAvatarUrl(agent.installation, agent.technicalName, {
                    size: 48,
                  }) ?? ''
                }
              />
            }
            className={classes.chip}
            onPress={() => onPick(agent)}
          >
            <span className={classes.name} title={agent.name}>
              {agent.name}
            </span>
          </Button>
        ))}
      </Flex>
    </Flex>
  );
}
