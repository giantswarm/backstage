import { ReactNode } from 'react';
import { Content } from '@backstage/core-components';
import { Flex, Text } from '@backstage/ui';

/**
 * The MCP tool-call section muster contributes to this tab.
 *
 * A shell around the `sections` extension input, so muster needs no knowledge
 * of the tab layout: the contract is still the node id
 * `sub-page:agent-platform/usage` and the input name `sections`, exactly as
 * `mcpUsageSection` in the muster plugin declares it.
 *
 * The tab is hidden entirely when nothing was contributed, so the fallback
 * copy below is only reachable by deep link — its route stays mounted on
 * purpose, because a bookmarked URL should explain itself rather than 404.
 */
export function UsageMcpPage({ sections }: { sections?: ReactNode[] }) {
  const hasSections = (sections?.length ?? 0) > 0;

  return (
    <Content>
      <Flex direction="column" gap="6" style={{ maxWidth: 1024 }}>
        {hasSections ? (
          <>{sections}</>
        ) : (
          <Text variant="body-medium" color="secondary">
            This portal does not have the muster plugin enabled, so there are no
            MCP tool-call figures to show.
          </Text>
        )}
      </Flex>
    </Content>
  );
}
