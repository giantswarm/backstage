import { Flex, Text } from '@backstage/ui';
import { GitOpsCard } from '@giantswarm/backstage-plugin-flux-react';
import {
  type Fact,
  FactList,
  InfoCard,
} from '@giantswarm/backstage-plugin-ui-react';
import { MCPServer, mcpServerStateSeverity } from '../../../lib/k8s';
import {
  gitOpsManagerDescription,
  isGitOpsManaged,
  qualifiedName,
  readProvenance,
} from '../../../lib/gitops';
import { ServerPageRow } from '../../../lib/serverGrouping';
import {
  AuthChain,
  hasAuthChain,
  HealthDetails,
  Mono,
  ServerConfig,
} from '../../McpServersPage/serverDetail';

/**
 * The MCPServer resource behind the connector: what it is called in the
 * cluster and where it comes from, Git or muster.
 */
function ResourceCard({
  server,
  showName,
}: {
  server: MCPServer;
  showName: boolean;
}) {
  const provenance = readProvenance(server);
  const manager = gitOpsManagerDescription(provenance);
  const facts: Fact[] = [];
  if (showName) {
    facts.push({
      label: 'MCPServer',
      value: (
        <Mono>{qualifiedName(server.getName(), server.getNamespace())}</Mono>
      ),
    });
  }
  if (manager) {
    facts.push({ label: manager.kind, value: <Mono>{manager.id}</Mono> });
  }
  // A HelmRelease applied from Git names the Kustomization as well.
  if (provenance.fluxKustomization && manager?.kind !== 'Kustomization') {
    facts.push({
      label: 'Kustomization',
      value: (
        <Mono>
          {qualifiedName(
            provenance.fluxKustomization,
            provenance.fluxKustomizationNamespace,
          )}
        </Mono>
      ),
    });
  }
  if (!manager && provenance.managedBy) {
    facts.push({ label: 'Managed by', value: provenance.managedBy });
  }
  if (!isGitOpsManaged(server)) {
    facts.push({ label: 'Origin', value: 'Added through muster, not Git' });
  }
  return (
    <InfoCard title="Resource">
      <FactList facts={facts} labelWidth={160} maxWidth={null} />
    </InfoCard>
  );
}

/** Whether muster's status says more about the server than its state. */
function hasHealthDetails(server: MCPServer): boolean {
  return Boolean(
    server.getReadyCondition()?.message ||
    server.getLastConnected() ||
    (server.getConsecutiveFailures() ?? 0) > 0 ||
    server.getNextRetryAfter() ||
    server.getLastError(),
  );
}

/**
 * Whether the fold-out opens on arrival: while muster reports the connector
 * failed, as the agent and model pages open theirs for a resource that is
 * not ready, since the health card says why.
 */
export function technicalDetailsOpenByDefault(row: ServerPageRow): boolean {
  return (
    row.kind === 'server' &&
    !row.server.getSuspended() &&
    mcpServerStateSeverity(row.server.getState()) === 'error'
  );
}

export type ConnectorTechnicalDetailsProps = {
  /** The connector's MCPServer, or the instance a family's are read from. */
  server: MCPServer;
  isFamily: boolean;
  installation: string;
};

/**
 * The connector as an MCPServer resource, inside the page's "Technical
 * details" fold-out, as on the agent and model pages: where it comes from
 * (GitOps), its configuration, its authentication chain and muster's health
 * detail. What the facts column says (sign-in, health count, address, added)
 * is not repeated. A family shows one instance's resource and points to the
 * Instances tab for the rest. Needs an `ErrorsProvider` above it, for the
 * GitOps card (`MusterProviders` mounts one).
 */
export function ConnectorTechnicalDetails({
  server,
  isFamily,
  installation,
}: ConnectorTechnicalDetailsProps) {
  return (
    <Flex direction="column" gap="4">
      {isFamily && (
        <Text as="p" variant="body-small" color="secondary">
          Shown for instance <Mono>{server.getName()}</Mono>; each instance's
          own configuration, health and authentication are on the Instances tab.
        </Text>
      )}
      {/* A cheap pre-check only: whether the connector is *actually* applied
          from Git is the card's own decision. */}
      {isGitOpsManaged(server) && (
        <GitOpsCard resource={server} installationName={installation} />
      )}
      <ResourceCard server={server} showName={!isFamily} />
      <InfoCard title="Configuration">
        <ServerConfig server={server} omitUrl />
      </InfoCard>
      {hasAuthChain(server) && (
        <InfoCard title="Authentication">
          <Flex direction="column" gap="2">
            <AuthChain server={server} />
          </Flex>
        </InfoCard>
      )}
      {!isFamily && hasHealthDetails(server) && (
        <InfoCard title="Health">
          <HealthDetails server={server} />
        </InfoCard>
      )}
    </Flex>
  );
}
