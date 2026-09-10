import { useMemo, useState } from 'react';
import { Link } from '@backstage/core-components';
import { Alert, Button, Flex, SearchField, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';

import type { ToolsetResolution } from '../../hooks/useToolsetResolution';
import { filterCatalogue } from '../../lib/filterCatalogue';
import {
  buildCatalogue,
  CatalogueGroup,
  catalogueInventory,
  countNoun,
  groupWorkflows,
  hasEntries,
  isDestructive,
  isReadOnly,
  ServerInfo,
} from '../../lib/toolset';
import { Disclosures, type DisclosureEntry } from '../Disclosures';
import { ShowMore } from '../ShowMore';

/**
 * Up to this many resolved tools the list opens itself: collapsing a handful
 * of rows would hide what already fits on the screen. Above it every section
 * starts shut, and the search — not a scroll — is how one tool is found.
 */
export const AUTO_EXPAND_MAX = 20;

const useStyles = makeStyles(theme => ({
  list: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    overflow: 'hidden',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: theme.spacing(1.5),
    padding: theme.spacing(0.75, 1.5),
    '&:not(:last-child)': {
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
  },
  name: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  summary: {
    flex: '1 1 220px',
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  marker: {
    fontSize: 11,
    lineHeight: 1.4,
    padding: theme.spacing(0, 0.75),
    borderRadius: 999,
    border: `1px solid ${theme.palette.divider}`,
    color: theme.palette.text.secondary,
    whiteSpace: 'nowrap',
  },
  markerDestructive: {
    borderColor: theme.palette.error.main,
    color: theme.palette.error.main,
  },
}));

/**
 * The read-only / destructive markers a server puts on its tool (MCP tool
 * annotations, forwarded by muster), so an author picks with understanding and
 * a viewer sees what an agent's tools can do. Nothing is shown for a tool whose
 * server declares neither.
 */
export function ToolMarkers({ tool }: { tool: ToolSummary }) {
  const classes = useStyles();
  const readOnly = isReadOnly(tool);
  const destructive = isDestructive(tool);
  if (!readOnly && !destructive) {
    return null;
  }
  return (
    <>
      {readOnly && <span className={classes.marker}>read-only</span>}
      {destructive && (
        <span className={`${classes.marker} ${classes.markerDestructive}`}>
          destructive
        </span>
      )}
    </>
  );
}

/** The rows of one section — a page at a time, the rest on request. */
function ToolRows({
  tools,
  toolHref,
  noun = 'tool',
}: {
  tools: ToolSummary[];
  toolHref?: (name: string) => string | undefined;
  noun?: 'tool' | 'workflow';
}) {
  const classes = useStyles();
  return (
    <ShowMore items={tools} noun={noun}>
      {visible => (
        <div className={classes.list} role="list">
          {visible.map(tool => {
            const href = toolHref?.(tool.name);
            return (
              <div
                key={tool.name}
                className={classes.row}
                role="listitem"
                title={tool.summary ?? tool.description}
              >
                {href ? (
                  <Link to={href} className={classes.name}>
                    {tool.name}
                  </Link>
                ) : (
                  <span className={classes.name}>{tool.name}</span>
                )}
                <ToolMarkers tool={tool} />
                {(tool.summary || tool.description) && (
                  <Text
                    variant="body-x-small"
                    color="secondary"
                    className={classes.summary}
                  >
                    {tool.summary ?? tool.description}
                  </Text>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ShowMore>
  );
}

/**
 * The resolved workflows, grouped by name prefix like the catalogue when there
 * are enough to need it, so a preset that resolves to hundreds of workflows
 * reads as a handful of collapsed sections rather than one wall of rows.
 */
function Workflows({
  workflows,
  query,
  defaultExpanded,
  toolHref,
}: {
  workflows: ToolSummary[];
  query: string;
  defaultExpanded: boolean;
  toolHref?: (name: string) => string | undefined;
}) {
  const groups = groupWorkflows(workflows);
  if (!groups) {
    return <ToolRows tools={workflows} toolHref={toolHref} noun="workflow" />;
  }
  return (
    <Disclosures
      nested
      query={query}
      defaultExpanded={defaultExpanded}
      entries={groups.map(group => ({
        key: `workflows/${group.key}`,
        trigger: `${group.label} — ${countNoun(
          group.workflows.length,
          'workflow',
        )}`,
        panel: () => (
          <ToolRows
            tools={group.workflows}
            toolHref={toolHref}
            noun="workflow"
          />
        ),
      }))}
    />
  );
}

/** The trigger line of a group: what it resolved to, in counts. */
function groupSummary(group: CatalogueGroup): string {
  const parts: string[] = [];
  if (group.servers.length > 0) {
    parts.push(countNoun(group.servers.length, 'server'));
    parts.push(
      countNoun(
        group.servers.reduce((sum, bucket) => sum + bucket.tools.length, 0),
        'tool',
      ),
    );
  }
  if (group.platformAdministration.length > 0) {
    parts.push(
      countNoun(
        group.platformAdministration.length,
        'platform administration tool',
      ),
    );
  }
  if (group.workflows.length > 0) {
    parts.push(countNoun(group.workflows.length, 'workflow'));
  }
  return parts.join(' · ');
}

function groupEntries(
  groups: CatalogueGroup[],
  query: string,
  defaultExpanded: boolean,
  toolHref?: (name: string) => string | undefined,
): DisclosureEntry[] {
  return groups.map(group => ({
    key: group.key,
    trigger: `${group.title} — ${groupSummary(group)}`,
    panel: () => (
      <>
        {group.servers.length > 0 && (
          <Disclosures
            nested
            query={query}
            defaultExpanded={defaultExpanded}
            entries={group.servers.map(bucket => ({
              key: `${group.key}/${bucket.name}`,
              trigger: `${bucket.name}${
                bucket.isFamily ? ' (family)' : ''
              } — ${countNoun(bucket.tools.length, 'tool')}`,
              panel: () => (
                <ToolRows tools={bucket.tools} toolHref={toolHref} />
              ),
            }))}
          />
        )}
        {group.platformAdministration.length > 0 && (
          <Disclosures
            nested
            query={query}
            defaultExpanded={defaultExpanded}
            entries={[
              {
                key: `${group.key}/platform-administration`,
                trigger: `Platform administration — ${countNoun(
                  group.platformAdministration.length,
                  'tool',
                )} of muster itself`,
                panel: () => (
                  <>
                    <Alert
                      status="warning"
                      title="Platform administration tools"
                      description="muster's own core tools manage the platform itself — its servers, workflows and configuration."
                    />
                    <ToolRows
                      tools={group.platformAdministration}
                      toolHref={toolHref}
                    />
                  </>
                ),
              },
            ]}
          />
        )}
        {group.workflows.length > 0 && (
          <Workflows
            workflows={group.workflows}
            query={query}
            defaultExpanded={defaultExpanded}
            toolHref={toolHref}
          />
        )}
      </>
    ),
  }));
}

export type ToolsetResolutionListProps = {
  resolution: ToolsetResolution;
  /** The installation's MCPServer CRs, for the grouping. */
  servers: ServerInfo[];
  /** Where a tool name links — the Tool Explorer, when the muster plugin routes are bound. */
  toolHref?: (name: string) => string | undefined;
  /** What to say when the toolset resolves to nothing at all. */
  emptyText?: string;
};

/**
 * The tools a toolset resolves to for the caller, grouped the way the platform
 * groups its servers (Infrastructure / Agent Platform / Registered servers /
 * Workflows), with muster's core tools set apart as *Platform administration*.
 *
 * A preset resolves to hundreds of tools on a real installation, so the list
 * opens as its counts: every section collapsed behind a one-line inventory,
 * the same disclosure structure the Tools step's catalogue uses, and a search
 * that opens the sections its matches are in. A resolution small enough to fit
 * on the screen ({@link AUTO_EXPAND_MAX}) skips all of that and simply shows
 * itself.
 *
 * Renders the resolution's other outcomes — an unknown preset, an aggregator
 * that predates toolsets, a failed read — as the messages they deserve rather
 * than as an empty list, which would read as "no tools".
 */
export function ToolsetResolutionList({
  resolution,
  servers,
  toolHref,
  emptyText = 'This toolset resolves to no tools for you right now.',
}: ToolsetResolutionListProps) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim();

  // Only a resolution has tools; the other outcomes render as their own
  // message below. Memoised so the grouping is not redone on every keystroke.
  const tools = useMemo(
    () => (resolution.status === 'resolved' ? resolution.tools : []),
    [resolution.status, resolution.tools],
  );

  // Short enough to read at a glance: no search field, nothing collapsed.
  const isShort = tools.length <= AUTO_EXPAND_MAX;
  // The selection can shrink the resolution under the threshold while a query
  // is still typed. The field goes away with it, so a query that still
  // filtered would strand the card on "Nothing matches" with nothing left to
  // clear it. No field, no filter.
  const activeQuery = isShort ? '' : trimmed;

  const groups: CatalogueGroup[] = useMemo(
    () =>
      buildCatalogue(tools, servers, [])
        .map(group => ({
          ...group,
          // A resolution lists what matched; a server with nothing matched is
          // not a row here (the sign-in affordance lives with the selectors).
          servers: group.servers.filter(bucket => bucket.tools.length > 0),
        }))
        // Dropping those servers can empty a group that `buildCatalogue` kept,
        // and an empty group is a disclosure with no summary over no panel.
        .filter(hasEntries),
    [tools, servers],
  );
  const visibleGroups = useMemo(
    () => filterCatalogue(groups, activeQuery),
    [groups, activeQuery],
  );
  const inventory = useMemo(() => catalogueInventory(groups), [groups]);
  const matches = useMemo(
    () => catalogueInventory(visibleGroups),
    [visibleGroups],
  );

  switch (resolution.status) {
    case 'idle':
      return null;
    case 'loading':
      return <Text color="secondary">Resolving the toolset…</Text>;
    case 'unavailable':
      return (
        <Alert
          status="info"
          title="Resolution not available in this portal"
          description="The muster plugin is not installed here, so what this toolset resolves to cannot be shown. The declaration itself is unaffected."
        />
      );
    case 'unsupported':
      return (
        <Alert
          status="warning"
          title="This installation's muster does not evaluate toolsets yet"
          description="It answered with its whole catalogue instead of a resolution, so the resolved list cannot be shown. An agent carries the toolset it declares, but this muster ignores it until it is upgraded — until then the agent sees everything the gateway exposes to whoever invokes it."
        />
      );
    case 'unknown-preset':
      return (
        <Alert
          status="danger"
          title="The toolset names a preset this installation does not define"
          description={resolution.error}
        />
      );
    case 'error':
      return (
        <Alert
          status="warning"
          title="Could not resolve the toolset"
          description={resolution.error}
        />
      );
    default:
      break;
  }

  const inventoryLine =
    activeQuery === ''
      ? [
          countNoun(inventory.servers, 'server'),
          countNoun(inventory.tools + inventory.platformAdministration, 'tool'),
          countNoun(inventory.workflows, 'workflow'),
        ].join(' · ')
      : `${countNoun(
          matches.tools + matches.platformAdministration,
          'tool',
        )} and ${countNoun(matches.workflows, 'workflow')} match`;

  return (
    <Flex direction="column" gap="3">
      {resolution.unmatched.length > 0 && (
        <Alert
          status="warning"
          title="Some selectors match nothing for you"
          description={`${resolution.unmatched.join(
            ', ',
          )} — a renamed or removed tool, a workflow that is not available, or a server you have not signed in to. They select nothing until that changes.`}
        />
      )}
      {resolution.truncated && (
        <Alert
          status="info"
          title="Resolved list cut short"
          description="The toolset resolves to more tools than fit in one page; only the first are listed."
        />
      )}
      {tools.length === 0 ? (
        <Text color="secondary">{emptyText}</Text>
      ) : (
        <>
          {!isShort && (
            <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
              <Flex grow basis="240px" direction="column">
                <SearchField
                  aria-label="Search the resolved tools"
                  placeholder="Search the resolved tools…"
                  value={query}
                  onChange={setQuery}
                />
              </Flex>
              {activeQuery !== '' && (
                <Button
                  variant="tertiary"
                  size="small"
                  onPress={() => setQuery('')}
                >
                  Clear the search
                </Button>
              )}
              <Text variant="body-small" color="secondary">
                {inventoryLine}
              </Text>
            </Flex>
          )}
          {visibleGroups.length === 0 ? (
            <Text color="secondary">
              Nothing matches &quot;{activeQuery}&quot;.
            </Text>
          ) : (
            <Disclosures
              query={activeQuery}
              defaultExpanded={isShort}
              entries={groupEntries(
                visibleGroups,
                activeQuery,
                isShort,
                toolHref,
              )}
            />
          )}
        </>
      )}
    </Flex>
  );
}
