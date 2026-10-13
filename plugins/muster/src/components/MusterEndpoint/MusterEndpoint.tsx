import { Flex, Text } from '@backstage/ui';
import { CopyButton } from '@giantswarm/backstage-plugin-ui-react';
import { useMusterInstance } from '../MusterInstanceProvider';

/**
 * The active muster's MCP endpoint with a copy button, for pointing an MCP
 * client of one's own at the environment. Nothing without a configured one.
 */
export function MusterEndpoint() {
  const { activeInstallationInfo } = useMusterInstance();
  const endpoint = activeInstallationInfo?.endpoint;
  if (!endpoint) {
    return null;
  }
  return (
    <Flex align="center" gap="2" style={{ flexWrap: 'wrap', minWidth: 0 }}>
      <Text variant="body-small" color="secondary">
        MCP endpoint
      </Text>
      <Text
        variant="body-small"
        style={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}
      >
        {endpoint}
      </Text>
      <CopyButton
        text={endpoint}
        label="Copy MCP endpoint"
        tooltip="Copy it to connect your own MCP client, such as Claude Code."
        size="compact"
      />
    </Flex>
  );
}
