import { ReactNode } from 'react';
import { Content } from '@backstage/core-components';
import { Flex } from '@backstage/ui';
import { AgentUsageSection } from '../AgentUsageSection';

/**
 * The Usage tab: your own agent usage, then the installation's MCP tool calls.
 *
 * Two sections with deliberately different scopes, each headed so a reader
 * cannot mistake one for the other — that separation is the whole reason they
 * share a page rather than living in two places. The second section is
 * contributed by the muster plugin through this sub-page's `sections` input, so
 * it is simply absent when muster is not registered.
 *
 * No data reads of its own; `AgentUsageSection` owns every state.
 */
export function UsagePage({ sections }: { sections?: ReactNode }) {
  return (
    <Content>
      {/* Matches muster's own column width, so the two sections line up. */}
      <Flex direction="column" gap="6" style={{ maxWidth: 1024 }}>
        <AgentUsageSection />
        {sections}
      </Flex>
    </Content>
  );
}
