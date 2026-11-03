import { Fragment, ReactNode } from 'react';
import { Flex } from '@backstage/ui';
import { UsageColumn } from '../UsageColumn';

/**
 * The Usage screen's Connectors view: how the connectors behind this
 * environment and their tools are used — tool calls, errors, latency, the
 * busiest tools and connectors — from every caller.
 *
 * Named for what it is about, connectors and their tools, rather than for the
 * protocol (MCP) they speak. It used to sit at the foot of Overview; it moved
 * here because "how are my connectors doing" is a question of its own
 * (`usage-metrics-ia.md`).
 *
 * The content is the muster plugin's, contributed through the `sections`
 * extension input of `page:agent-platform/usage` (see `mcpUsageSection`
 * in the muster plugin), so this view knows nothing of its layout. The router
 * offers the view only when something was contributed.
 *
 * The section follows the screen's time-range control, as every other view
 * does, and its heading names the window.
 */
export function UsageConnectorsPage({ sections }: { sections: ReactNode[] }) {
  return (
    <UsageColumn>
      <Flex direction="column" gap="6">
        {/* Contributed elements carry no key of their own. */}
        {sections.map((section, index) => (
          <Fragment key={index}>{section}</Fragment>
        ))}
      </Flex>
    </UsageColumn>
  );
}
