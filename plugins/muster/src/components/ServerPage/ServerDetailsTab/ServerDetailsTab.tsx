import { ReactNode } from 'react';
import { Card, CardBody, CardHeader, Flex, Text } from '@backstage/ui';
import { useGitOpsSource } from '@giantswarm/backstage-plugin-flux-react';
import { GitOpsManagedLabel } from '@giantswarm/backstage-plugin-ui-react';
import { MCPServer, mcpServerStateSeverity } from '../../../lib/k8s';
import { gitOpsLabelSource, isGitOpsManaged } from '../../../lib/gitops';
import { wizardEditBlocker } from '../../../lib/mcpServerDefinition';
import { ServerPageRow } from '../../../lib/serverGrouping';
import {
  AuthChain,
  HealthDetails,
  Provenance,
  RuntimeState,
  ServerConfig,
} from '../../McpServersPage/serverDetail';
import { MusterSummary } from '../../McpServersPage/MusterSummary';
import { serverLiveActions } from '../serverActions';
import {
  DEACTIVATED_SIGN_IN_GATE,
  Gate,
  ServerAuthActions,
} from '../../shared';

/** One titled block of the Details tab. */
export function DetailsCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <Text as="h3" variant="title-x-small" weight="bold">
          {title}
        </Text>
      </CardHeader>
      <CardBody>
        <Flex direction="column" gap="2">
          {children}
        </Flex>
      </CardBody>
    </Card>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <Text as="p" variant="body-small" color="secondary">
      {children}
    </Text>
  );
}

const SESSION_GATE =
  'Live runtime state is read through the muster session, which is not available -- see the notice above.';

/** The GitOps claim with its source link, for a managed server. */
function GitOpsClaim({ server }: { server: MCPServer }) {
  const source = useGitOpsSource(server, server.cluster);
  return <GitOpsManagedLabel source={gitOpsLabelSource(source)} />;
}

/**
 * Why a write action is not offered, or offered in a different form -- said on
 * the page, since the header's menu only lists what can be done.
 */
function actionNotes(server: MCPServer, authenticated: boolean): string[] {
  if (isGitOpsManaged(server)) {
    return [
      'This server is managed through GitOps: Flux would revert a live change, so it is edited or removed in Git. “Edit/Remove” in the header shows how.',
    ];
  }
  if (!authenticated) {
    return [
      'Editing, deactivating, reconnecting and deleting this server run through the muster session, which is not available -- connect to muster first.',
    ];
  }
  const notes: string[] = [];
  const blocker = wizardEditBlocker(server);
  if (blocker) {
    // Already ends in the pointer to "Edit as JSON", the header's primary.
    notes.push(blocker);
  }
  const { reconnectGate } = serverLiveActions(server);
  if (reconnectGate) {
    notes.push(reconnectGate);
  }
  return notes;
}

function SingularDetails({
  server,
  authenticated,
}: {
  server: MCPServer;
  authenticated: boolean;
}) {
  const healthy = mcpServerStateSeverity(server.getState()) === 'ok';
  const notes = actionNotes(server, authenticated);
  return (
    <>
      <DetailsCard title="Configuration">
        {server.getDescription() && <Note>{server.getDescription()}</Note>}
        <ServerConfig server={server} />
        {notes.map(note => (
          <Note key={note}>{note}</Note>
        ))}
      </DetailsCard>
      <DetailsCard title="Authentication">
        <AuthChain server={server} />
        {authenticated && server.canAuthenticateInteractively() && (
          <Flex direction="column" align="start">
            <ServerAuthActions
              serverName={server.getName()}
              installation={server.cluster}
              oauthConfigured={server.getAuth()?.type === 'oauth'}
              signInGate={
                server.getSuspended() ? DEACTIVATED_SIGN_IN_GATE : undefined
              }
            />
          </Flex>
        )}
      </DetailsCard>
      {!healthy && (
        <DetailsCard title="Health">
          <HealthDetails server={server} />
        </DetailsCard>
      )}
      <DetailsCard title="Runtime (live)">
        {authenticated ? (
          <RuntimeState server={server} />
        ) : (
          <Gate label={SESSION_GATE} />
        )}
      </DetailsCard>
      <DetailsCard title="GitOps provenance">
        {isGitOpsManaged(server) && <GitOpsClaim server={server} />}
        <Provenance server={server} />
      </DetailsCard>
    </>
  );
}

function FamilyDetails({
  family,
  servers,
  representative,
  qualified,
}: {
  family: string;
  servers: MCPServer[];
  representative: MCPServer;
  qualified: boolean;
}) {
  const instanceArg = representative.getInstanceArg();
  const healthy = servers.filter(
    s => mcpServerStateSeverity(s.getState()) === 'ok',
  ).length;
  const shownFor =
    representative.getManagementCluster() ?? representative.getName();
  return (
    <>
      <DetailsCard title="Server family">
        <Text as="p" variant="body-medium">
          <code>{family}</code> runs as {servers.length}{' '}
          {servers.length === 1 ? 'instance' : 'instances'}, {healthy} of them
          healthy. Its tools are offered once for the whole family
          {instanceArg ? (
            <>
              ; callers choose an instance with <code>{instanceArg}</code>
            </>
          ) : null}
          .
        </Text>
        <Note>
          {isGitOpsManaged(representative)
            ? 'The family is managed through GitOps and has no live write actions.'
            : 'A family is not edited from this page.'}{' '}
          Signing in to an instance is on the Instances tab.
        </Note>
      </DetailsCard>
      <DetailsCard title="Configuration">
        <ServerConfig server={representative} />
        <Note>
          {qualified
            ? `Shared across the family; shown for ${shownFor}.`
            : `No connected instance on this installation — values shown are from ${shownFor} and may differ per instance.`}
        </Note>
      </DetailsCard>
      <DetailsCard title="Authentication">
        <AuthChain server={representative} />
        <Note>
          Shown for {shownFor}; the auth chain may differ per instance.
        </Note>
      </DetailsCard>
      <DetailsCard title="GitOps provenance">
        {isGitOpsManaged(representative) && (
          <GitOpsClaim server={representative} />
        )}
        <Provenance server={representative} />
      </DetailsCard>
    </>
  );
}

export interface ServerDetailsTabProps {
  row: ServerPageRow;
  servers: MCPServer[];
  representative?: { server: MCPServer; qualified: boolean };
  authenticated: boolean;
}

/**
 * The server's configuration, authentication, health, live runtime and
 * provenance, as cards. muster itself shows its endpoint and what it
 * aggregates.
 */
export function ServerDetailsTab({
  row,
  servers,
  representative,
  authenticated,
}: ServerDetailsTabProps) {
  let body: ReactNode;
  if (row.kind === 'server') {
    body = (
      <SingularDetails server={row.server} authenticated={authenticated} />
    );
  } else if (row.kind === 'family' && representative) {
    body = (
      <FamilyDetails
        family={row.family}
        servers={row.servers}
        representative={representative.server}
        qualified={representative.qualified}
      />
    );
  } else {
    body = (
      <>
        <MusterSummary servers={servers} />
        <DetailsCard title="muster (core tools)">
          <Text as="p" variant="body-medium">
            muster aggregates the installation's MCP servers and offers tools of
            its own: for workflows, services, configuration, MCP server
            definitions and authentication. Its tools are on the Tools tab.
          </Text>
          <Note>
            muster itself is part of the installation and cannot be changed from
            here.
          </Note>
        </DetailsCard>
      </>
    );
  }

  return (
    <Flex direction="column" gap="3" style={{ maxWidth: 1024 }}>
      {body}
    </Flex>
  );
}
