import { Alert, Flex, Text } from '@backstage/ui';

import {
  approvalRefusedAfterSave,
  noApprovalChartRefusal,
  type AgentManagerErrorCode,
} from '../../lib/agentManager';

/**
 * agent-manager's refusal of approval settings for a namespace whose agent
 * chart source serves a chart without them, in plain words, with its own
 * below. Says what was saved: nothing, or (when the refusal came after the
 * rest of the edit landed) everything but the settings. Nothing for any other
 * refusal.
 */
export function ApprovalChartRefusal({
  failure,
}: {
  failure: { code?: AgentManagerErrorCode; message: string } | undefined;
}) {
  const refused = noApprovalChartRefusal(failure);
  if (!refused) {
    return null;
  }
  return (
    <Flex direction="column" gap="1">
      <Alert
        status="danger"
        title="This agent's chart takes no approval settings"
        description={
          approvalRefusedAfterSave(failure)
            ? `The agent chart ${refused.chart} that this agent's namespace uses has no Allow, Ask or Block settings, so they were not saved. Every other change, the tool list included, was saved. Reload the agent, then remove the settings on the Tools step, or ask a platform admin to move the namespace to a newer agent chart.`
            : `The agent chart ${refused.chart} that this agent's namespace uses has no Allow, Ask or Block settings, so nothing was saved. Remove the settings on the Tools step to save the tools without them, or ask a platform admin to move the namespace to a newer agent chart.`
        }
      />
      <Text variant="body-small" color="secondary">
        agent-manager said: {failure!.message}
      </Text>
    </Flex>
  );
}
