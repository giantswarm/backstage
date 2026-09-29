import { Alert, Button, Flex, Text } from '@backstage/ui';

import {
  pendingObjects,
  type NodePoolWriteResult,
} from '../../lib/clusterManager';

export type PartialWriteOutcomeProps = {
  /** The write cluster-manager cut short (`partial: true`). */
  result: NodePoolWriteResult;
  /** The action's name for the title: Deploy, Remove. */
  action: string;
  /** Re-run the same call with the same arguments (`mode: apply`). */
  onContinue: () => void;
  isBusy: boolean;
};

/**
 * A write cluster-manager stopped so its answer arrived within the caller's
 * deadline: the objects it did not reach are `pending`, and `nextStep` says
 * to re-run with the same arguments — the pending objects are written first
 * (cluster-manager 0.7.4+). **Continue** is that re-run. One piece for every
 * write the node-pool dialogs make: Deploy here, Remove in its own dialog.
 */
export function PartialWriteOutcome({
  result,
  action,
  onContinue,
  isBusy,
}: PartialWriteOutcomeProps) {
  const pending = pendingObjects(result);
  return (
    <Alert
      status="warning"
      data-testid="partial-write"
      title={`${action} was cut short: ${pending.length} of ${result.objects.length} objects are pending`}
      description={
        <Flex direction="column" gap="2">
          {result.nextStep && (
            <Text variant="body-small">{result.nextStep}</Text>
          )}
          <Flex direction="column" gap="1" data-testid="pending-objects">
            {pending.map(object => (
              <Text
                key={`${object.kind}/${object.namespace}/${object.name}`}
                variant="body-small"
                color="secondary"
              >
                {object.kind} {object.namespace}/{object.name}: {object.action}
              </Text>
            ))}
          </Flex>
        </Flex>
      }
      customActions={
        <Button
          variant="primary"
          size="small"
          onPress={onContinue}
          isDisabled={isBusy}
        >
          {isBusy ? 'Continuing…' : 'Continue'}
        </Button>
      }
    />
  );
}
