import { Flex, Text } from '@backstage/ui';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';
import { ExternalLink, InfoCard } from '@giantswarm/backstage-plugin-ui-react';

import { skillLabel } from './helpers';

/**
 * The skills mounted into the agent (`spec.skills.gitRefs`).
 *
 * Each is a path in a Git repository the agent pulls at startup. The `ref` is
 * shown because it decides *which* version of a skill the agent actually runs —
 * an unpinned skill changes under the agent whenever its repository does, which
 * is the kind of thing you want to see while debugging changed behaviour.
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
        <Flex direction="column" gap="3">
          {skills.map((skill, index) => (
            <Flex
              // Nothing in a gitRef is guaranteed unique — the same repository can
              // be mounted at several paths, and both `name` and `path` are
              // optional — so the index is part of the key.
              key={`${skill.url}#${skill.path ?? ''}#${index}`}
              direction="column"
              gap="1"
            >
              <Text variant="body-medium">{skillLabel(skill)}</Text>
              <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
                <ExternalLink href={skill.url}>{skill.url}</ExternalLink>
                {skill.path && (
                  <Text
                    variant="body-small"
                    color="secondary"
                    style={{ fontFamily: 'monospace' }}
                  >
                    {skill.path}
                  </Text>
                )}
                <Text variant="body-small" color="secondary">
                  {skill.ref ? `at ${skill.ref}` : 'default branch (unpinned)'}
                </Text>
              </Flex>
            </Flex>
          ))}
        </Flex>
      )}
    </InfoCard>
  );
}
