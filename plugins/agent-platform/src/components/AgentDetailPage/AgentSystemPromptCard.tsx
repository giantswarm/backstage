import { Flex, Text } from '@backstage/ui';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';
import { CodeBlock, InfoCard } from '@giantswarm/backstage-plugin-ui-react';

/**
 * The agent's system prompt (`spec.systemPrompt`).
 *
 * Rendered as a copyable code block rather than prose: it is a configured value
 * someone may want to lift verbatim into a review or a chart change, and the
 * monospace framing makes clear where it starts and ends.
 */
export function AgentSystemPromptCard({ agent }: { agent: Agent }) {
  const systemMessage = agent.getSystemMessage();
  const source = agent.getSystemMessageSource();

  return (
    <InfoCard title="System prompt">
      {systemMessage ? (
        <CodeBlock text={systemMessage} />
      ) : (
        <Flex direction="column" gap="1">
          <Text variant="body-medium" color="secondary">
            {source
              ? `Read from the ConfigMap ${source.name}, key ${source.key}.`
              : 'Not set on the AgentTemplate.'}
          </Text>
          {/* Worth spelling out: an empty field does not mean the agent has no
              system prompt, only that it is not configured inline here. */}
          {!source && (
            <Text variant="body-small" color="secondary">
              The agent runs with whatever default its chart or Harness
              provides.
            </Text>
          )}
        </Flex>
      )}
    </InfoCard>
  );
}
