import {
  StatusError,
  StatusOK,
  StatusWarning,
} from '@backstage/core-components';
import { Flex, Text } from '@backstage/ui';
import { ConditionState } from '../../../../hooks/gatewayTopology';

// Reasons are CamelCase without break points; let them wrap anywhere instead
// of being clipped.
const wrap = { overflowWrap: 'anywhere' } as const;

/**
 * One status condition. A healthy condition reads "True"; only a failing one
 * shows its reason, which is what someone fixing it needs. `not-reported`
 * gets a warning, since nothing serving is the likely cause, and
 * `not-available` no status at all, so neither can be mistaken for healthy.
 */
export const ConditionStatus = ({
  condition,
}: {
  condition: ConditionState;
}) => {
  switch (condition.status) {
    case 'true':
      return (
        <Flex align="center" gap="1">
          <StatusOK />
          <Text variant="body-medium">True</Text>
        </Flex>
      );
    case 'false':
      return (
        <Flex align="center" gap="1">
          <StatusError />
          <Text variant="body-medium" style={wrap}>
            {condition.reason ?? 'False'}
          </Text>
        </Flex>
      );
    case 'not-reported':
      return (
        <Flex align="center" gap="1">
          <StatusWarning />
          <Text
            variant="body-medium"
            title="No controller has reported this condition yet."
          >
            Not reported
          </Text>
        </Flex>
      );
    default:
      return (
        <Text variant="body-medium" color="secondary">
          Not available
        </Text>
      );
  }
};
