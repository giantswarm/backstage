import { ReactNode } from 'react';
import { Flex, Text } from '@backstage/ui';
import { ShellAwareContent } from '../ShellAwareContent';
import { UsageColumn } from '../UsageColumn';

/**
 * The Usage screen's Connectors view: how the connectors behind this
 * environment and their tools are used — tool calls, errors, latency, the
 * busiest tools and connectors — from every caller.
 *
 * Named for what it is about, connectors and their tools, rather than for the
 * protocol (MCP) they speak. It used to sit at the foot of Overview; it moved
 * here so Overview fits one screen (T52), and because "how are my connectors
 * doing" is a question of its own (`usage-metrics-ia.md`).
 *
 * The content is the muster plugin's, contributed through the `sections`
 * extension input of `sub-page:agent-platform/usage` (see `mcpUsageSection`
 * in the muster plugin), so this view knows nothing of its layout. The router
 * offers the view only when something was contributed.
 *
 * muster's metrics cover a fixed 30 days and do not follow the screen's
 * time-range control yet, which the caption says — the section's own heading
 * names its window too.
 */
export function UsageConnectorsPage({ sections }: { sections: ReactNode[] }) {
  return (
    <ShellAwareContent>
      <UsageColumn>
        <Flex direction="column" gap="6">
          <Text as="p" variant="body-medium" color="secondary">
            These figures ignore the selected time range.
          </Text>
          {sections}
        </Flex>
      </UsageColumn>
    </ShellAwareContent>
  );
}
