import { Content } from '@backstage/core-components';
import { Flex } from '@backstage/ui';
import { AgentUsageSection } from '../AgentUsageSection';

/**
 * The session-level half of the Usage tab: sessions, turns, tool calls and an
 * estimated cost, from kagent's stored conversations.
 *
 * **Its own tab because its scope is its own.** kagent's session list is
 * `WHERE user_id = <caller>` with no cross-user endpoint, so this is the
 * reader's own history where the Overview and Cost tabs are everyone's. That
 * used to be a caveat in a section description on a shared page; a tab makes
 * it structural, which is the only way it stays true when someone skims.
 *
 * A shell, deliberately: `AgentUsageSection` owns every state, including the
 * unsecure-mode case where kagent resolves all callers to one built-in user
 * and the numbers stop being personal.
 */
export function UsageConversationsPage() {
  return (
    <Content>
      <Flex direction="column" gap="6" style={{ maxWidth: 1024 }}>
        <AgentUsageSection />
      </Flex>
    </Content>
  );
}
