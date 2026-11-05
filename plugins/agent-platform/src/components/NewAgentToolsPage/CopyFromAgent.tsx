import { Fragment, useMemo, useState } from 'react';
import { Flex, SearchField, Text } from '@backstage/ui';
import {
  Agent,
  RemoteMCPServer,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  CatalogNoMatch,
  isSearchableList,
  matchesQuery,
  ShowMore,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  declaredToolset,
  labelOfPresetSelector,
  MUSTER_MCP_SERVER_NAME,
  selectorLabel,
  toolsetOfAgent,
  type ToolsetCarrier,
} from '../../lib/toolset';
import {
  SelectableCard,
  SelectableCardGrid,
  useSelectableCardStyles,
} from '../SelectableCard';

/**
 * How many source agents the step shows before *Show more*: a few rows of
 * cards, so the catalogue below stays within reach.
 */
const INITIAL_SOURCES = 12;

/** Whether a source is the agent a search names: its display name, name or namespace. */
function matchesSource(query: string, source: AgentToolsetSource): boolean {
  return matchesQuery(
    query,
    `${source.displayName} ${source.namespace} ${source.name}`,
  );
}

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
 * the follow-up). Reads the installation's Agents and RemoteMCPServers
 * the way the agents list does; only agents with a declared toolset are
 * offered, since an agent with implicit full access has nothing to copy.
 *
 * On a fleet that is hundreds of agents, so the cards come a page at a time,
 * with a search by name or namespace once there are more than a page or so.
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

  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  // Kept while a search is in force, so it can still be cleared.
  const isSearchable = isSearchableList(sources.length, trimmed !== '');
  const matching = useMemo(
    () =>
      trimmed === ''
        ? sources
        : sources.filter(source => matchesSource(trimmed, source)),
    [sources, trimmed],
  );

  if ((isLoading || isLoadingCarriers) && sources.length === 0) {
    return <Text color="secondary">Reading the environment's agents…</Text>;
  }
  if (sources.length === 0) {
    return (
      <Text color="secondary">
        No agent on {installation ?? 'this environment'} declares a toolset yet.
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="3">
      {isSearchable && (
        <SearchField
          aria-label="Search agents"
          placeholder="Search agents by name or namespace…"
          value={query}
          onChange={setQuery}
        />
      )}
      {matching.length === 0 ? (
        <CatalogNoMatch plural="agents" search={trimmed} />
      ) : (
        // Keyed on the search, so a new one starts over at the first page.
        <ShowMore
          key={trimmed}
          items={matching}
          initial={INITIAL_SOURCES}
          noun="agent"
        >
          {visible => (
            <SelectableCardGrid
              role="radiogroup"
              ariaLabel="Existing agents' toolsets"
              minWidth={240}
            >
              {visible.map(source => (
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
                  <Text
                    variant="body-small"
                    color="secondary"
                    title={source.selectors.join(', ')}
                  >
                    {source.selectors.map((selector, index) => (
                      <Fragment key={selector}>
                        {index > 0 && ', '}
                        {labelOfPresetSelector(selector) === undefined ? (
                          <span className={classes.code}>{selector}</span>
                        ) : (
                          selectorLabel(selector)
                        )}
                      </Fragment>
                    ))}
                  </Text>
                </SelectableCard>
              ))}
            </SelectableCardGrid>
          )}
        </ShowMore>
      )}
    </Flex>
  );
}
