import { ReactNode } from 'react';
import { Box, Flex, Text } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Agent,
  AgentMcpBinding,
  getHelmReleaseName,
  getHelmReleaseNamespace,
  HARNESS_LABEL,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  DateComponent,
  InfoCard,
  NotAvailable,
  StructuredMetadataList,
} from '@giantswarm/backstage-plugin-ui-react';

import type { ClientServingSummary } from '../../lib/serving';
import {
  agentDetailRouteRef,
  deploymentDetailsExternalRouteRef,
  musterToolExplorerExternalRouteRef,
} from '../../routes';
import { ModelServingStatus } from '../ModelServingStatus';
import {
  describeToolScope,
  isGatewayServerBinding,
  mcpBindingId,
} from './helpers';

/** Monospace for identifiers the reader may retype into `kubectl`. */
const MONO: React.CSSProperties = { fontFamily: 'monospace' };

/**
 * How the model is described: the ModelConfig's friendly name, with the model id
 * and provider underneath — and, where the serving layer has a word on the
 * model behind it, whether that model is serving (the same label the Model
 * configs and Agents views show; `Not serving` links to the Serving view).
 *
 * Falls back to the bare reference when the ModelConfig cannot be read — which is
 * normal for a non-admin, since ModelConfigs live in namespaces they may not have
 * access to — rather than implying the agent has no model.
 */
function ModelValue({
  modelConfigName,
  modelConfig,
  modelServing,
  namespace,
}: {
  modelConfigName?: string;
  modelConfig?: ModelConfig;
  modelServing?: ClientServingSummary;
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
      {modelServing && <ModelServingStatus serving={modelServing} />}
    </Flex>
  );
}

/**
 * One MCP server binding: the same-namespace `RemoteMCPServer` the agent draws
 * tools from, and how much of it.
 */
function McpBindingRow({
  agent,
  binding,
}: {
  agent: Agent;
  binding: AgentMcpBinding;
}) {
  const toolExplorerRoute = useRouteRef(musterToolExplorerExternalRouteRef);
  const isGateway = isGatewayServerBinding(agent, binding);

  // Preselect the installation the agent runs on, the way muster's own
  // cross-links do. Only offered for the gateway: the Tool Explorer talks to
  // muster, so it can say nothing about any other MCP server.
  const musterLink =
    isGateway && toolExplorerRoute
      ? `${toolExplorerRoute()}?installation=${encodeURIComponent(
          agent.cluster,
        )}`
      : undefined;

  return (
    <Flex direction="column" gap="1">
      <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
        <Text variant="body-medium" style={MONO}>
          {mcpBindingId(binding)}
        </Text>
        {musterLink && <Link to={musterLink}>Explore tools</Link>}
      </Flex>
      <Text variant="body-small" color="secondary">
        {describeToolScope(binding, isGateway)}
      </Text>
      {/* Rare, and the only per-binding setting that changes what a user will
          experience mid-session (the turn pauses for a decision), so it is
          worth naming. */}
      {binding.requireApproval && (
        <Text variant="body-small" color="secondary">
          Requires approval before every call
        </Text>
      )}
    </Flex>
  );
}

/** The tools block: MCP servers, then any agents invoked as tools. */
function ToolsValue({ agent }: { agent: Agent }) {
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);
  const mcpBindings = agent.getMcpBindings();
  const agentRefs = agent.getAgentRefs();

  if (mcpBindings.length === 0 && agentRefs.length === 0) {
    return (
      <Text variant="body-small" color="secondary">
        This agent declares no tool servers, so it has no tools beyond its own
        reasoning.
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="3">
      {mcpBindings.map((binding, index) => (
        <McpBindingRow
          // The server name is not unique: nothing stops two bindings referencing
          // the same server with different `tools`/`requireApproval`, which is
          // how you express "these tools need approval, those don't" for one
          // server. Same reasoning as the skill cards.
          key={`${mcpBindingId(binding)}#${index}`}
          agent={agent}
          binding={binding}
        />
      ))}

      {agentRefs.map(ref => {
        // Another template invoked over A2A. Same installation and namespace
        // by definition — a binding cannot cross either — and `name` is what
        // the agent calls the tool, `templateRef.name` the template behind it.
        const namespace = agent.getNamespace() ?? '';
        const target = ref.templateRef.name ?? ref.name;
        const href = agentDetailRoute?.({
          installation: agent.cluster,
          namespace,
          name: target,
        });

        return (
          <Flex key={`agent/${ref.name}/${target}`} direction="column" gap="1">
            <Text variant="body-medium">
              Agent{' '}
              {href ? (
                <Link to={href}>{`${namespace}/${target}`}</Link>
              ) : (
                <span style={MONO}>{`${namespace}/${target}`}</span>
              )}
            </Text>
            <Text variant="body-small" color="secondary">
              Called as the tool <span style={MONO}>{ref.name}</span> over A2A
              {ref.isolation === 'Dedicated' ? ', in its own instance' : ''}
            </Text>
          </Flex>
        );
      })}
    </Flex>
  );
}

/**
 * The Harness the admission label asks to run the agent. The label is what
 * makes a Harness admit the template; without it the agent never becomes
 * ready, and the status card says so.
 */
function HarnessValue({ agent }: { agent: Agent }) {
  const harness = agent.getHarnessLabel();
  if (!harness) {
    return (
      <Text variant="body-small" color="secondary">
        Not labelled for any Harness (<span style={MONO}>{HARNESS_LABEL}</span>{' '}
        is missing)
      </Text>
    );
  }
  return (
    <Flex direction="column" gap="1">
      <Text variant="body-medium" style={MONO}>
        {harness}
      </Text>
      <Text variant="body-small" color="secondary">
        From the label <span style={MONO}>{HARNESS_LABEL}</span>
      </Text>
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
  /** The serving layer's word on the model behind `modelConfig`, when it has one. */
  modelServing?: ClientServingSummary;
};

/**
 * What the agent *is*, as its AgentTemplate defines it.
 *
 * Read-only. Editing an agent means changing the Helm values its release renders
 * from, which this plugin has no write path for yet.
 */
export function AgentConfigurationCard({
  agent,
  modelConfig,
  modelServing,
}: AgentConfigurationCardProps) {
  const namespace = agent.getNamespace();
  const created = agent.getCreatedTimestamp();

  const metadata: Record<string, ReactNode> = {
    Harness: <HarnessValue agent={agent} />,
    Model: (
      <ModelValue
        modelConfigName={agent.getModelConfigName()}
        modelConfig={modelConfig}
        modelServing={modelServing}
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
