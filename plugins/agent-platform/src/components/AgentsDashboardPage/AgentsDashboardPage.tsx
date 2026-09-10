import { Content } from '@backstage/core-components';
import { Flex } from '@backstage/ui';
import { AgentUsageSection } from '../AgentUsageSection';

/**
 * The "Agents" dashboard of the Dashboards tab: agent-session usage over the
 * backend's window, derived from kagent's stored conversations.
 *
 * **It carries no page heading of its own.** It used to: while the agent and
 * the MCP numbers shared one page, a scope-neutral "Usage" heading above them
 * was the only thing stopping the first section's heading ("Your agent usage")
 * from reading as scoping the second, which is explicitly *not* the reader's.
 * The two are separate tabs now, so nothing here needs disambiguating and the
 * section's own heading is the top of the content — which is why it ranks `h2`.
 *
 * That heading is also the only place the scope and the window are stated,
 * because neither is knowable here: whether the numbers are the reader's own is
 * resolved per installation inside `AgentUsageSection` (kagent in `unsecure`
 * mode resolves every caller to one built-in user), and the window is
 * configurable and travels in the response.
 *
 * No data reads of its own; `AgentUsageSection` owns every state.
 */
export function AgentsDashboardPage() {
  return (
    <Content>
      {/* Matches the MCP dashboard's column width, so switching tabs does not
          reflow the reading column. */}
      <Flex direction="column" gap="6" style={{ maxWidth: 1024 }}>
        <AgentUsageSection />
      </Flex>
    </Content>
  );
}
