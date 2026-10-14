import { ReactNode } from 'react';
import { Flex, Text } from '@backstage/ui';
import { WorkflowStatistics } from '../WorkflowStatistics';

export type WorkflowUsageTabProps = {
  name: string;
  installation?: string;
  /** Whether the muster session can read executions. */
  hasSession: boolean;
  /** Where muster asks for a session, what to show instead of statistics. */
  sessionGate?: ReactNode;
};

/**
 * The workflow page's Usage tab: its statistics — the last run, muster's run
 * totals, rates and runs per day.
 */
export function WorkflowUsageTab({
  name,
  installation,
  hasSession,
  sessionGate,
}: WorkflowUsageTabProps) {
  if (!hasSession) {
    return <>{sessionGate}</>;
  }
  return (
    <Flex direction="column" gap="4">
      <Text as="p" variant="body-medium" color="secondary">
        Every run counts, whether an agent, another workflow or a person started
        it.
      </Text>
      <WorkflowStatistics
        name={name}
        installation={installation}
        hasSession={hasSession}
      />
    </Flex>
  );
}
