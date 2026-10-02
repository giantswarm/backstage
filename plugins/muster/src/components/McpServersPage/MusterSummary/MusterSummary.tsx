import { Flex, Text } from '@backstage/ui';
import { CopyButton, InfoHint } from '@giantswarm/backstage-plugin-ui-react';
import {
  MCPServer,
  SERVERS_HEALTH_WARNING_FRACTION,
  serversHealthSummary,
} from '../../../lib/k8s';
import {
  useMusterInstance,
  useMusterSession,
} from '../../MusterInstanceProvider';

export type MusterSummaryProps = {
  servers: MCPServer[];
};

function healthHint(deactivated: number): string {
  const threshold = Math.round(SERVERS_HEALTH_WARNING_FRACTION * 100);
  const lines = [
    `Healthy: running, connected, or waiting only for someone to sign in. Amber once more than ${threshold}% are not.`,
  ];
  if (deactivated > 0) {
    lines.push(
      `${deactivated} deactivated ${deactivated === 1 ? 'server is' : 'servers are'} not counted.`,
    );
  }
  return lines.join('\n');
}

/**
 * The installation's muster at a glance, above the server list: the endpoint
 * an MCP client connects to, and the totals the list itself does not add up.
 * The tool total needs the muster session and is left out without one.
 */
export function MusterSummary({ servers }: MusterSummaryProps) {
  const { activeInstallation, activeInstallationInfo } = useMusterInstance();
  const { toolCount, toolCountPending } = useMusterSession();

  const { healthy, total, deactivated, tone } = serversHealthSummary(servers);
  const endpoint = activeInstallationInfo?.endpoint;

  let tools = '';
  if (toolCountPending) {
    tools = ' · … tools';
  } else if (toolCount !== undefined) {
    tools = ` · ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}`;
  }

  return (
    // One line: the endpoint, then the totals. It wraps only when the
    // endpoint leaves no room.
    <Flex align="center" gap="3" mb="4" style={{ flexWrap: 'wrap' }}>
      <Flex align="center" gap="2">
        <Text variant="body-medium" color="secondary">
          Endpoint
        </Text>
        {endpoint ? (
          <>
            <Text
              variant="body-medium"
              style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
            >
              {endpoint}
            </Text>
            <CopyButton text={endpoint} label="Copy endpoint" size="compact" />
          </>
        ) : (
          <Text variant="body-medium" color="secondary">
            not configured for {activeInstallation}
          </Text>
        )}
      </Flex>
      <Flex align="center" gap="1">
        <Text variant="body-medium" color="secondary" aria-hidden>
          ·
        </Text>
        <Text variant="body-medium" color="secondary">
          {total} {total === 1 ? 'server' : 'servers'} ·{' '}
          <Text
            as="span"
            variant="body-medium"
            color={tone === 'warning' ? 'warning' : 'secondary'}
          >
            {healthy} healthy
          </Text>
          {tools}
        </Text>
        <InfoHint label="How healthy servers are counted" size="medium">
          {healthHint(deactivated)}
        </InfoHint>
      </Flex>
    </Flex>
  );
}
