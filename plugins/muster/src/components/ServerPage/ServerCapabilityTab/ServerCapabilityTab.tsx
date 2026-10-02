import { ReactNode } from 'react';
import { Flex, Text } from '@backstage/ui';
import { MCPServer } from '../../../lib/k8s';
import { ServerPageRow } from '../../../lib/serverGrouping';
import {
  ServerPrompts,
  ServerResources,
} from '../../McpServersPage/serverDetail';

export interface ServerCapabilityTabProps {
  capability: 'resources' | 'prompts';
  row: ServerPageRow;
  representative: { server: MCPServer; qualified: boolean };
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
 * for its representative instance, as the servers page does. The page shows
 * the tab only when muster counts some, so an empty list is a read that came
 * back short; it says so plainly for a connected server and keeps the
 * cautious wording for one that may simply be unreachable.
 */
export function ServerCapabilityTab({
  capability,
  row,
  representative,
  sessionGate,
}: ServerCapabilityTabProps) {
  if (sessionGate) {
    return <>{sessionGate}</>;
  }

  const { server } = representative;
  // `Connected`/`Running` only: severity `ok` also covers `Auth Required` and
  // `Awaiting Session`, whose lists are empty because this session is not
  // connected to the server, not because it exposes nothing.
  const state = server.getState();
  const connected = state === 'Connected' || state === 'Running';
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
