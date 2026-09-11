import { useMemo } from 'react';
import { Text } from '@backstage/ui';
import {
  Agent,
  RemoteMCPServer,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import {
  declaredToolset,
  MUSTER_MCP_SERVER_NAME,
  toolsetOfAgent,
  type ToolsetCarrier,
} from '../../lib/toolset';
import {
  SelectableCard,
  SelectableCardGrid,
  useSelectableCardStyles,
} from '../SelectableCard';

export type AgentToolsetSource = {
  name: string;
  namespace: string;
  displayName: string;
  selectors: string[];
};

/**
 * The agents on an installation that declare a toolset, as copy sources. The
 * declaration lives on each agent's carrier `RemoteMCPServer`, so the
 * installation's servers come along.
 */
export function agentToolsetSources(
  agents: Agent[],
  carriers: readonly ToolsetCarrier[],
): AgentToolsetSource[] {
  return agents
    .map(agent => {
      const declared = toolsetOfAgent(agent, MUSTER_MCP_SERVER_NAME, carriers);
      if (declared.state !== 'declared' || declared.selectors.length === 0) {
        return undefined;
      }
      return {
        name: agent.getName(),
        namespace: agent.getNamespace() ?? '',
        displayName: agent.getDisplayName(),
        selectors: declared.selectors,
      };
    })
    .filter((source): source is AgentToolsetSource => source !== undefined)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * *Start from an existing agent's toolset*: copies another agent's selector
 * list into the step (D4 — reuse is a copy in the wizard; shared toolsets are
 * the follow-up). Reads the installation's AgentTemplates and RemoteMCPServers
 * the way the agents list does; only agents with a declared toolset are
 * offered, since an agent with implicit full access has nothing to copy.
 */
export function CopyFromAgent({
  installation,
  current,
  onCopy,
}: {
  installation: string | undefined;
  /** The step's current toolset, to mark the source it equals. */
  current: string[];
  onCopy: (selectors: string[]) => void;
}) {
  const classes = useSelectableCardStyles();
  const clusters = installation ? [installation] : [];
  const { resources, isLoading } = useResources(
    clusters,
    Agent,
    {},
    {
      enabled: Boolean(installation),
      enableDiscovery: false,
    },
  );
  const { resources: carriers, isLoading: isLoadingCarriers } = useResources(
    clusters,
    RemoteMCPServer,
    {},
    { enabled: Boolean(installation), enableDiscovery: false },
  );
  const sources = useMemo(
    () => agentToolsetSources(resources, carriers),
    [resources, carriers],
  );
  // Compared as declared, so an agent without tools matches the empty selection.
  const currentKey = declaredToolset(current).join(',');

  if ((isLoading || isLoadingCarriers) && sources.length === 0) {
    return <Text color="secondary">Reading the installation's agents…</Text>;
  }
  if (sources.length === 0) {
    return (
      <Text color="secondary">
        No agent on {installation ?? 'this installation'} declares a toolset
        yet.
      </Text>
    );
  }

  return (
    <SelectableCardGrid
      role="radiogroup"
      ariaLabel="Existing agents' toolsets"
      minWidth={240}
    >
      {sources.map(source => (
        <SelectableCard
          key={`${source.namespace}/${source.name}`}
          role="radio"
          selected={source.selectors.join(',') === currentKey}
          ariaLabel={`Copy the toolset of ${source.displayName}`}
          onSelect={() => onCopy(source.selectors)}
        >
          <Text weight="bold">{source.displayName}</Text>
          <Text variant="body-x-small" color="secondary">
            <span className={classes.code}>
              {source.namespace}/{source.name}
            </span>
          </Text>
          <Text variant="body-small" color="secondary">
            <span className={classes.code}>{source.selectors.join(', ')}</span>
          </Text>
        </SelectableCard>
      ))}
    </SelectableCardGrid>
  );
}
