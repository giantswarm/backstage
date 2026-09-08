import { Fragment } from 'react';
import { Link } from '@backstage/core-components';
import { Alert, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';

import type { ToolsetResolution } from '../../hooks/useToolsetResolution';
import {
  buildCatalogue,
  CatalogueGroup,
  groupWorkflows,
  isDestructive,
  isReadOnly,
  ServerInfo,
} from '../../lib/toolset';
import { ShowMore } from '../ShowMore';

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
  groupTitle: {
    marginTop: theme.spacing(1),
  },
  serverTitle: {
    marginTop: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
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

/** The rows of one section — the first page at once, the rest behind *Show all*. */
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
 * reads as a handful of headed sections rather than one wall of rows.
 */
function WorkflowRows({
  workflows,
  toolHref,
}: {
  workflows: ToolSummary[];
  toolHref?: (name: string) => string | undefined;
}) {
  const classes = useStyles();
  const groups = groupWorkflows(workflows);
  if (!groups) {
    return <ToolRows tools={workflows} toolHref={toolHref} noun="workflow" />;
  }
  return (
    <>
      {groups.map(group => (
        <div key={group.key}>
          <Text
            as="h5"
            variant="body-small"
            color="secondary"
            className={classes.serverTitle}
          >
            {group.label} · {group.workflows.length}
          </Text>
          <ToolRows
            tools={group.workflows}
            toolHref={toolHref}
            noun="workflow"
          />
        </div>
      ))}
    </>
  );
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
  const classes = useStyles();

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

  const groups: CatalogueGroup[] = buildCatalogue(
    resolution.tools,
    servers,
    [],
  ).map(group => ({
    ...group,
    // A resolution lists what matched; a server with nothing matched is not a
    // row here (the sign-in affordance lives with the selectors, not the list).
    servers: group.servers.filter(bucket => bucket.tools.length > 0),
  }));

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
      {resolution.tools.length === 0 ? (
        <Text color="secondary">{emptyText}</Text>
      ) : (
        groups.map(group => (
          <Fragment key={group.key}>
            <Text
              as="h4"
              variant="body-medium"
              weight="bold"
              className={classes.groupTitle}
            >
              {group.title}
            </Text>
            {group.servers.map(bucket => (
              <div key={bucket.name}>
                <Text
                  as="h5"
                  variant="body-small"
                  color="secondary"
                  className={classes.serverTitle}
                >
                  {bucket.name}
                  {bucket.isFamily ? ' (family)' : ''} · {bucket.tools.length}
                </Text>
                <ToolRows tools={bucket.tools} toolHref={toolHref} />
              </div>
            ))}
            {group.platformAdministration.length > 0 && (
              <div>
                <Text
                  as="h5"
                  variant="body-small"
                  color="secondary"
                  className={classes.serverTitle}
                >
                  Platform administration ·{' '}
                  {group.platformAdministration.length}
                </Text>
                <Alert
                  status="warning"
                  title="Platform administration tools"
                  description="muster's own core tools manage the platform itself — its servers, workflows and configuration."
                />
                <ToolRows
                  tools={group.platformAdministration}
                  toolHref={toolHref}
                />
              </div>
            )}
            {group.workflows.length > 0 && (
              <WorkflowRows workflows={group.workflows} toolHref={toolHref} />
            )}
          </Fragment>
        ))
      )}
    </Flex>
  );
}
