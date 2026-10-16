import {
  StatusError,
  StatusOK,
  StatusPending,
} from '@backstage/core-components';
import { Flex, Text } from '@backstage/ui';
import { ConditionState } from '../../../../hooks/gatewayTopology';

/**
 * One status condition. `not-reported` and `not-available` are shown without
 * a status dot so they can never be mistaken for a healthy condition.
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
          <Text variant="body-medium">{condition.reason ?? 'True'}</Text>
        </Flex>
      );
    case 'false':
      return (
        <Flex align="center" gap="1">
          <StatusError />
          <Text variant="body-medium">{condition.reason ?? 'False'}</Text>
        </Flex>
      );
    case 'not-reported':
      return (
        <Flex align="center" gap="1">
          <StatusPending />
          <Text variant="body-medium" color="secondary">
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
