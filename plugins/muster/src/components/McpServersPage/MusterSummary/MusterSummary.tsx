import { useApi } from '@backstage/core-plugin-api';
import { Flex, Text } from '@backstage/ui';
import { useQuery } from '@tanstack/react-query';
import { CopyButton } from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../../apis';
import { MCPServer, serversHealthSummary } from '../../../lib/k8s';
import {
  isUnreachableSession,
  useMusterInstance,
  useMusterSession,
} from '../../MusterInstanceProvider';

export type MusterSummaryProps = {
  servers: MCPServer[];
};

/**
 * The installation's muster at a glance, above the server list: the endpoint
 * an MCP client connects to, and the totals the list itself does not add up.
 * The tool total needs the muster session and is left out without one.
 */
export function MusterSummary({ servers }: MusterSummaryProps) {
  const { activeInstallation, activeInstallationInfo } = useMusterInstance();
  const musterApi = useApi(musterApiRef);
  const session = useMusterSession();

  // Same key and call as the session probe, so react-query serves both from
  // one round-trip.
  const { data: overview } = useQuery({
    queryKey: ['muster', 'overview', activeInstallation],
    queryFn: () =>
      musterApi.filterTools({ installation: activeInstallation, limit: 1 }),
    enabled: Boolean(activeInstallation) && !isUnreachableSession(session),
  });
  const toolCount = session.authenticated ? overview?.total : undefined;

  const { healthy, total, tone } = serversHealthSummary(servers);
  const endpoint = activeInstallationInfo?.endpoint;

  return (
    <Flex direction="column" gap="1" mb="4">
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
      <Text variant="body-medium" color="secondary">
        {total} {total === 1 ? 'server' : 'servers'} ·{' '}
        <Text
          as="span"
          variant="body-medium"
          color={tone === 'warning' ? 'warning' : 'secondary'}
        >
          {healthy} healthy
        </Text>
        {toolCount !== undefined &&
          ` · ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}`}
      </Text>
    </Flex>
  );
}
