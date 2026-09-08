import { ReactNode } from 'react';
import { Content } from '@backstage/core-components';
import { Flex } from '@backstage/ui';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';
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
 * **The page's own heading is deliberately scope-neutral.** Without one, the
 * first section's heading ("Your agent usage") became the page's — the topmost
 * and only real heading in the content — so it read as scoping everything
 * below it, including a section that is explicitly *not* the reader's. The page
 * heading now names what the page holds and says the two sections differ; each
 * section states its own scope at the level below.
 *
 * It also cannot claim the numbers are the reader's, because on an installation
 * where kagent does not scope to the caller they are not — and that is resolved
 * per installation inside `AgentUsageSection`, not here. So it describes the
 * sections rather than asserting whose usage they show.
 *
 * And it names no window, for the same reason: the backend's window is
 * configurable and travels in the response, so only a section that has read one
 * can state it without going stale.
 *
 * No data reads of its own; `AgentUsageSection` owns every state.
 */
export function UsagePage({ sections }: { sections?: ReactNode }) {
  return (
    <Content>
      {/* Matches muster's own column width, so the two sections line up. */}
      <Flex direction="column" gap="6" style={{ maxWidth: 1024 }}>
        <SectionHeader
          as="h2"
          title="Usage"
          description="Agent sessions, and the MCP tool calls agents make. The two sections below cover different scopes — each states whose usage it reports, and over what window."
        />
        <AgentUsageSection />
        {sections}
      </Flex>
    </Content>
  );
}
