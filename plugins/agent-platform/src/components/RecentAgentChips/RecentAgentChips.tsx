import { useId } from 'react';
import { Button, Flex, Text } from '@backstage/ui';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import type { AgentRow } from '../AgentsDataProvider';
import { AgentAvatar } from '../AgentAvatar';

export type RecentAgentChipsProps = {
  /** In display order; see `recentAgents`. */
  agents: AgentRow[];
  onPick: (agent: AgentRow) => void;
};

/** The agents of the person's latest sessions, one press from being chosen. */
export function RecentAgentChips({ agents, onPick }: RecentAgentChipsProps) {
  const labelId = useId();
  const buildAvatarUrl = useAgentAvatarUrl();

  if (agents.length === 0) {
    return null;
  }

  return (
    <Flex direction="column" align="center" gap="2">
      <Text id={labelId} variant="body-small" color="secondary">
        Or pick one of your recent agents
      </Text>
      <Flex
        role="group"
        aria-labelledby={labelId}
        justify="center"
        gap="2"
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
            onPress={() => onPick(agent)}
          >
            {agent.name}
          </Button>
        ))}
      </Flex>
    </Flex>
  );
}
