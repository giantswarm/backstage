import { ReactNode } from 'react';
import { Box, Flex, Text } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Agent,
  AgentFailure,
  AgentMcpBinding,
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

import { useAgentToolset } from '../../hooks/useAgentToolset';
import type { ClientServingSummary } from '../../lib/serving';
import { describeToolset } from '../../lib/toolset';
import {
  agentDetailRouteRef,
  deploymentDetailsExternalRouteRef,
} from '../../routes';
import { ModelServingStatus } from '../ModelServingStatus';
import { FailureMarker } from './FailureMarker';
import {
  describeToolScope,
  isGatewayServerBinding,
  mcpBindingId,
} from './helpers';

/** Monospace for identifiers the reader may retype into `kubectl`. */
const MONO: React.CSSProperties = { fontFamily: 'monospace' };

/**
 * How the model is described: the ModelConfig's friendly name, with the model id
 * and provider underneath (or leading, when the ModelConfig has no display
 * name) — and, where the serving layer has a word on the
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
  isFailing,
}: {
  modelConfigName?: string;
  modelConfig?: ModelConfig;
  modelServing?: ClientServingSummary;
  namespace?: string;
  isFailing: boolean;
}) {
  if (!modelConfigName) {
    return <NotAvailable />;
  }

  const modelLine = [modelConfig?.getModel(), modelConfig?.getProvider()]
    .filter(Boolean)
    .join(' · ');
  // Without a display name the resource name is all there is, and the
  // ModelConfig line below already shows it. The model itself leads instead,
  // still in monospace like every identifier here.
  const displayName = modelConfig?.getDisplayNameAnnotation();

  return (
    <Flex direction="column" gap="1">
      {displayName ? (
        <Text variant="body-medium">{displayName}</Text>
      ) : (
        <Text variant="body-medium" style={MONO}>
          {modelLine || modelConfigName}
        </Text>
      )}
      {displayName && modelLine && (
        <Text variant="body-small" color="secondary" style={MONO}>
          {modelLine}
        </Text>
      )}
      <Text variant="body-small" color="secondary">
        ModelConfig{' '}
        <span style={MONO}>
          {namespace ? `${namespace}/${modelConfigName}` : modelConfigName}
        </span>
      </Text>
      {modelServing && <ModelServingStatus serving={modelServing} />}
      {isFailing && <FailureMarker />}
    </Flex>
  );
}

/**
 * One MCP server binding outside the gateway: a same-namespace
 * `RemoteMCPServer` the agent draws tools from directly, and how much of it.
 */
function McpBindingRow({ binding }: { binding: AgentMcpBinding }) {
  return (
    <Flex direction="column" gap="1">
      <Text variant="body-medium" style={MONO}>
        {mcpBindingId(binding)}
      </Text>
      <Text variant="body-small" color="secondary">
        {describeToolScope(binding)}
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

/**
 * What the agent can reach through the gateway, in the words the Agents list
 * uses for it — read from the toolset its carrier `RemoteMCPServer` declares,
 * which is a Kubernetes read. Resolving it to tools needs muster, so that is
 * left to the Tools tab, linked here.
 */
function GatewayToolsetSummary({
  agent,
  toolsHref,
}: {
  agent: Agent;
  toolsHref?: string;
}) {
  const { declared, isReading } = useAgentToolset(agent);
  const { summary, detail } = describeToolset(declared);

  return (
    <Flex direction="column" gap="1">
      <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
        <Text variant="body-medium">
          {isReading ? 'Reading the toolset…' : summary}
        </Text>
        {toolsHref && <Link to={toolsHref}>See tools</Link>}
      </Flex>
      {!isReading && detail && (
        <Text variant="body-small" color="secondary" style={MONO}>
          {detail}
        </Text>
      )}
    </Flex>
  );
}

/**
 * The tools block: what the agent reaches through the gateway in one line,
 * then any MCP server bound directly and any agents invoked as tools.
 */
function ToolsValue({
  agent,
  toolsHref,
  isFailing,
}: {
  agent: Agent;
  toolsHref?: string;
  isFailing: boolean;
}) {
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);
  const mcpBindings = agent.getMcpBindings();
  const directBindings = mcpBindings.filter(
    binding => !isGatewayServerBinding(agent, binding),
  );
  const hasGateway = directBindings.length < mcpBindings.length;
  const agentRefs = agent.getAgentRefs();

  if (mcpBindings.length === 0 && agentRefs.length === 0) {
    return (
      <Flex direction="column" gap="1">
        <Text variant="body-medium">No tools</Text>
        <Text variant="body-small" color="secondary">
          The agent has nothing beyond its own reasoning.
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="3">
      {hasGateway && (
        <GatewayToolsetSummary agent={agent} toolsHref={toolsHref} />
      )}

      {directBindings.map((binding, index) => (
        <McpBindingRow
          // The server name is not unique: nothing stops two bindings referencing
          // the same server with different `tools`/`requireApproval`, which is
          // how you express "these tools need approval, those don't" for one
          // server. Same reasoning as the skill cards.
          key={`${mcpBindingId(binding)}#${index}`}
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

      {isFailing && <FailureMarker />}
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
  /** A failed agent's root cause, which marks the field it is about. */
  failure?: AgentFailure;
  /** The Tools tab, which resolves the toolset this card summarises. */
  toolsHref?: string;
};

/**
 * What the agent *is*, as its AgentTemplate defines it. Where it runs — the
 * installation, `namespace/name` — is in the page header and the Harness in
 * the Status card, so neither is repeated here.
 *
 * Read-only here: the values behind it are changed through **Edit agent…** in
 * the header's actions, which goes through agent-manager as the person.
 */
export function AgentConfigurationCard({
  agent,
  modelConfig,
  modelServing,
  failure,
  toolsHref,
}: AgentConfigurationCardProps) {
  const namespace = agent.getNamespace();
  const created = agent.getCreatedTimestamp();

  const metadata: Record<string, ReactNode> = {
    Model: (
      <ModelValue
        modelConfigName={agent.getModelConfigName()}
        modelConfig={modelConfig}
        modelServing={modelServing}
        namespace={namespace}
        isFailing={failure?.field === 'model'}
      />
    ),
    Tools: (
      <ToolsValue
        agent={agent}
        toolsHref={toolsHref}
        isFailing={failure?.field === 'tools'}
      />
    ),
    Created: created ? (
      <DateComponent value={created} relative />
    ) : (
      <NotAvailable />
    ),
    'Deployed by': <DeployedByValue agent={agent} />,
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
