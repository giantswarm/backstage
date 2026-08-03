import { ReactNode } from 'react';
import { Box, Flex, Text } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Agent,
  AgentMcpServerRef,
  getHelmReleaseName,
  getHelmReleaseNamespace,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  DateComponent,
  InfoCard,
  NotAvailable,
  StructuredMetadataList,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  agentDetailRouteRef,
  deploymentDetailsExternalRouteRef,
  musterToolExplorerExternalRouteRef,
} from '../../routes';
import {
  describeToolScope,
  isMusterServerRef,
  mcpServerRefId,
} from './helpers';

/** Monospace for identifiers the reader may retype into `kubectl`. */
const MONO: React.CSSProperties = { fontFamily: 'monospace' };

/**
 * How the model is described: the ModelConfig's friendly name, with the model id
 * and provider underneath.
 *
 * Falls back to the bare reference when the ModelConfig cannot be read — which is
 * normal for a non-admin, since ModelConfigs live in namespaces they may not have
 * access to — rather than implying the agent has no model.
 */
function ModelValue({
  modelConfigName,
  modelConfig,
  namespace,
}: {
  modelConfigName?: string;
  modelConfig?: ModelConfig;
  namespace?: string;
}) {
  if (!modelConfigName) {
    return <NotAvailable />;
  }

  const modelId = modelConfig?.getModel();
  const provider = modelConfig?.getProvider();

  return (
    <Flex direction="column" gap="1">
      <Text variant="body-medium">
        {modelConfig?.getDisplayName() ?? modelConfigName}
      </Text>
      {(modelId || provider) && (
        <Text variant="body-small" color="secondary" style={MONO}>
          {[modelId, provider].filter(Boolean).join(' · ')}
        </Text>
      )}
      <Text variant="body-small" color="secondary">
        ModelConfig{' '}
        <span style={MONO}>
          {namespace ? `${namespace}/${modelConfigName}` : modelConfigName}
        </span>
      </Text>
    </Flex>
  );
}

/**
 * One MCP server the agent draws tools from.
 *
 * The prop is `server`, not `ref` — React intercepts a `ref` prop rather than
 * passing it through.
 */
function McpServerRow({
  server: serverRef,
  installation,
}: {
  server: AgentMcpServerRef;
  installation: string;
}) {
  const toolExplorerRoute = useRouteRef(musterToolExplorerExternalRouteRef);

  // Preselect the installation the agent runs on, the way muster's own
  // cross-links do. Only offered for the Muster gateway: the Tool Explorer talks
  // to muster, so it can say nothing about any other MCP server.
  const musterLink =
    isMusterServerRef(serverRef) && toolExplorerRoute
      ? `${toolExplorerRoute()}?installation=${encodeURIComponent(installation)}`
      : undefined;

  return (
    <Flex direction="column" gap="1">
      <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
        <Text variant="body-medium" style={MONO}>
          {serverRef.kind ?? 'RemoteMCPServer'} {mcpServerRefId(serverRef)}
        </Text>
        {musterLink && <Link to={musterLink}>Explore tools</Link>}
      </Flex>
      <Text variant="body-small" color="secondary">
        {describeToolScope(serverRef)}
      </Text>
      {/* Rare, and the only per-tool setting that changes what a user will
          experience mid-session, so it is worth naming. */}
      {serverRef.requireApproval && serverRef.requireApproval.length > 0 && (
        <Text variant="body-small" color="secondary">
          Requires approval: {serverRef.requireApproval.join(', ')}
        </Text>
      )}
    </Flex>
  );
}

/** The tools block: MCP servers, then any agents invoked as tools. */
function ToolsValue({ agent }: { agent: Agent }) {
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);
  const mcpServers = agent.getMcpServerRefs();
  const agentRefs = agent.getAgentRefs();

  if (mcpServers.length === 0 && agentRefs.length === 0) {
    return (
      <Text variant="body-small" color="secondary">
        This agent declares no tool servers, so it has no tools beyond its own
        reasoning.
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="3">
      {mcpServers.map(serverRef => (
        <McpServerRow
          key={mcpServerRefId(serverRef)}
          server={serverRef}
          installation={agent.cluster}
        />
      ))}

      {agentRefs.map(ref => {
        // Another agent invoked over A2A. Same installation by definition — a
        // tool reference cannot cross clusters — and the namespace defaults to
        // this agent's own when the reference omits it.
        const namespace = ref.namespace ?? agent.getNamespace() ?? '';
        const href = agentDetailRoute?.({
          installation: agent.cluster,
          namespace,
          name: ref.name,
        });

        return (
          <Flex
            key={`agent/${namespace}/${ref.name}`}
            direction="column"
            gap="1"
          >
            <Text variant="body-medium">
              Agent{' '}
              {href ? (
                <Link to={href}>{`${namespace}/${ref.name}`}</Link>
              ) : (
                <span style={MONO}>{`${namespace}/${ref.name}`}</span>
              )}
            </Text>
            <Text variant="body-small" color="secondary">
              Called as a tool over A2A
            </Text>
          </Flex>
        );
      })}
    </Flex>
  );
}

/** The owning HelmRelease, linked to its deployment page when gs is enabled. */
function DeployedByValue({ agent }: { agent: Agent }) {
  const deploymentDetailsRoute = useRouteRef(deploymentDetailsExternalRouteRef);

  const name = getHelmReleaseName(agent);
  if (!name) {
    // No Flux Helm labels: applied directly (kubectl, or a chart that doesn't
    // stamp them). Saying "n/a" is honest here — we know of no owner.
    return <NotAvailable />;
  }

  const namespace =
    getHelmReleaseNamespace(agent) ?? agent.getNamespace() ?? '';
  const label = namespace ? `${namespace}/${name}` : name;
  const href = deploymentDetailsRoute?.({
    installationName: agent.cluster,
    kind: 'helmrelease',
    namespace,
    name,
  });

  return (
    <Flex direction="column" gap="1">
      {href ? (
        <Link to={href}>{`HelmRelease ${label}`}</Link>
      ) : (
        <Text variant="body-medium" style={MONO}>{`HelmRelease ${label}`}</Text>
      )}
      <Text variant="body-small" color="secondary">
        Reconciling this agent's chart
      </Text>
    </Flex>
  );
}

export type AgentConfigurationCardProps = {
  agent: Agent;
  modelConfig?: ModelConfig;
};

/**
 * What the agent *is*, as the Agent CR defines it.
 *
 * Read-only. Editing an agent means changing the Helm values its release renders
 * from, which this plugin has no write path for yet.
 */
export function AgentConfigurationCard({
  agent,
  modelConfig,
}: AgentConfigurationCardProps) {
  const namespace = agent.getNamespace();
  const created = agent.getCreatedTimestamp();

  const metadata: Record<string, ReactNode> = {
    Type: agent.getType() ?? <NotAvailable />,
    Model: (
      <ModelValue
        modelConfigName={agent.getModelConfigName()}
        modelConfig={modelConfig}
        namespace={namespace}
      />
    ),
    Installation: agent.cluster,
    Namespace: namespace ?? <NotAvailable />,
    Created: created ? (
      <DateComponent value={created} relative />
    ) : (
      <NotAvailable />
    ),
    'Deployed by': <DeployedByValue agent={agent} />,
    Tools: <ToolsValue agent={agent} />,
  };

  return (
    <InfoCard title="Configuration">
      <Box>
        <StructuredMetadataList
          metadata={metadata}
          fixedKeyColumnWidth="160px"
        />
      </Box>
    </InfoCard>
  );
}
