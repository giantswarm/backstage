import { ReactNode } from 'react';
import { Flex, Text } from '@backstage/ui';
import { MCPServer, mcpServerStateSeverity } from '../../lib/k8s';
import { ServerPageRow } from '../../lib/serverGrouping';
import { ServerPrompts, ServerResources } from '../McpServersPage/serverDetail';

export interface ServerCapabilityTabProps {
  capability: 'resources' | 'prompts';
  row: ServerPageRow;
  representative?: { server: MCPServer; qualified: boolean };
  sessionGate?: ReactNode;
}

function Note({ children }: { children: ReactNode }) {
  return (
    <Text as="p" variant="body-small" color="secondary">
      {children}
    </Text>
  );
}

/**
 * The resources or prompts a server exposes, list only. A family's are read
 * for its representative instance, as the servers page does. An empty list
 * says so plainly for a connected server -- most expose neither -- and keeps
 * the cautious wording for one that may simply be unreachable.
 */
export function ServerCapabilityTab({
  capability,
  row,
  representative,
  sessionGate,
}: ServerCapabilityTabProps) {
  if (row.kind === 'core' || !representative) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        muster offers tools of its own and no {capability}; the {capability} on
        this installation come from the servers it aggregates.
      </Text>
    );
  }
  if (sessionGate) {
    return <>{sessionGate}</>;
  }

  const { server } = representative;
  const connected = mcpServerStateSeverity(server.getState()) === 'ok';
  const noun = row.kind === 'family' ? 'This family' : 'This server';
  const emptyText = connected ? `${noun} exposes no ${capability}.` : undefined;

  return (
    <Flex direction="column" gap="2" style={{ maxWidth: 1024 }}>
      {row.kind === 'family' && (
        <Note>
          Shown for {server.getManagementCluster() ?? server.getName()}.
        </Note>
      )}
      {capability === 'resources' ? (
        <ServerResources server={server} emptyText={emptyText} />
      ) : (
        <ServerPrompts server={server} emptyText={emptyText} />
      )}
    </Flex>
  );
}
