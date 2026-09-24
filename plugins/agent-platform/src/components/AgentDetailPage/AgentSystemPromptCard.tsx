import { Flex, Text } from '@backstage/ui';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  CollapsibleMarkdown,
  CopyButton,
  InfoCard,
} from '@giantswarm/backstage-plugin-ui-react';

/**
 * The agent's system prompt (`spec.systemPrompt`).
 *
 * Rendered as Markdown, which is how prompts are usually written, and cut to a
 * preview when long. The copy button copies the source verbatim, for a review
 * or a chart change.
 */
export function AgentSystemPromptCard({ agent }: { agent: Agent }) {
  const systemMessage = agent.getSystemMessage();
  const source = agent.getSystemMessageSource();

  return (
    <InfoCard
      title="System prompt"
      headerActions={
        systemMessage && (
          <CopyButton
            text={systemMessage}
            label="Copy system prompt"
            size="compact"
          />
        )
      }
    >
      {systemMessage ? (
        <CollapsibleMarkdown
          content={systemMessage}
          toggleLabels={{ expand: 'Show full prompt', collapse: 'Show less' }}
        />
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
