import { ReactNode, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import Dns from '@material-ui/icons/Dns';
import Power from '@material-ui/icons/Power';
import Build from '@material-ui/icons/Build';
import Lock from '@material-ui/icons/Lock';
import AddIcon from '@material-ui/icons/Add';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Button as UiButton } from '@backstage/ui';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';
import { newMcpServerRouteRef } from '../../routes';
import { ActiveInstallationNote } from '../ActiveInstallationNote';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import {
  SectionHeader,
  Gate,
  DisclosureAccordion,
  FreshnessIndicator,
} from '../shared';
import { TOOL_GROUPS, ToolGroupKey } from '../../lib/k8s';
import {
  ServerRow,
  ToolGroupPartition,
  familyGroups,
  fleetManagementClusters,
  partitionServers,
} from '../../lib/serverGrouping';
import { StandardServerDisclosure } from './StandardServerDisclosure';
import { IntegrationServerDisclosure } from './IntegrationServerDisclosure';
import { CoreFamiliesPanel } from './CoreFamiliesPanel';
import { AddAdHocServerButton } from './ServerMutationActions';

const useStyles = makeStyles((theme: Theme) => ({
  column: {
    maxWidth: 1024,
  },
  section: {
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(4),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  presentNote: {
    marginBottom: theme.spacing(1.5),
    color: theme.palette.text.secondary,
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  topGate: {
    marginBottom: theme.spacing(2),
  },
  coreSummary: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1, 1.5),
    width: '100%',
  },
  coreName: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: 600,
  },
  coreKind: {
    fontSize: 11,
    color: theme.palette.text.secondary,
  },
}));

/** The section glyph per tool group. */
const GROUP_ICONS: Record<ToolGroupKey, ReactNode> = {
  'agent-platform': <Build />,
  infrastructure: <Dns />,
  registered: <Power />,
};

/**
 * What an empty tool group says. The tier is declared by the chart that
 * ships a server, so "nothing here" on an installation whose charts have not
 * rolled the label yet is expected -- and its servers are listed further
 * down, not missing.
 */
function emptyGroupNote(group: ToolGroupKey): string {
  const { title } = TOOL_GROUPS[group];
  switch (group) {
    case 'registered':
      return 'No registered servers in this installation.';
    default:
      return `No servers declare the ${title} tool group in this installation. Servers whose charts do not carry the tool-group label yet are listed under ${TOOL_GROUPS.registered.title}.`;
  }
}

function rowKey(row: ServerRow): string {
  return row.kind === 'family'
    ? `family:${row.family}`
    : `server:${row.server.cluster}/${row.server.getName()}`;
}

export function McpServersPage() {
  const classes = useStyles();
  const {
    mcpServers,
    activeInstallation,
    activeInstallationInfo,
    isLoading,
    dataUpdatedAt,
    isRefreshing,
    retry,
  } = useMusterInstance();

  const requiresAuth = activeInstallationInfo?.requiresAuth ?? false;

  // Session state (and the connect action) are resolved once via the shared
  // hook so the manager, the dashboard and the workflows page agree (ADR D3).
  const {
    authenticated,
    connecting,
    connect: handleConnect,
  } = useMusterSession();

  // Tool groups in display order (Agent Platform, Infrastructure, Registered
  // servers), each already in row shape: families collapsed, singular servers
  // one row each. Every group is present even when empty, so the page keeps a
  // stable set of sections.
  const partition = useMemo(() => partitionServers(mcpServers), [mcpServers]);

  // "Register server" in the shared Agent Platform page header (agent-flow
  // convention) — the primary path for bringing a remote MCP server onto the
  // platform, ahead of the raw-JSON ad-hoc dialog below.
  const navigate = useNavigate();
  const newServerLink = useRouteRef(newMcpServerRouteRef);
  const headerActions = useMemo(
    () => (
      <UiButton
        variant="primary"
        iconStart={<AddIcon />}
        onPress={() => newServerLink && navigate(newServerLink())}
      >
        Register server
      </UiButton>
    ),
    [newServerLink, navigate],
  );
  useProvidePageHeaderActions(headerActions);

  // The fleet every family's coverage is measured against, whichever tool
  // group the family is listed under: a family present on fewer clusters than
  // this is still being rolled out (or was withdrawn), which its row says as
  // "10/24 clusters" plus the missing names when expanded.
  const fleetClusters = useMemo(
    () => fleetManagementClusters(familyGroups(partition)),
    [partition],
  );

  const renderRow = (row: ServerRow) =>
    row.kind === 'family' ? (
      <StandardServerDisclosure
        key={rowKey(row)}
        family={row.family}
        servers={row.servers}
        fleetClusters={fleetClusters}
        activeInstallation={activeInstallation}
        authenticated={authenticated}
        defaultExpanded={false}
      />
    ) : (
      <IntegrationServerDisclosure
        key={rowKey(row)}
        server={row.server}
        authenticated={authenticated}
      />
    );

  // muster itself, as a server: the last row of the Agent Platform group. It
  // provides tools directly for managing workflows, services, configuration,
  // MCP server definitions and authentication wherever muster is reachable.
  const coreRow = (
    <DisclosureAccordion
      key="core"
      defaultExpanded={false}
      summary={
        <Box className={classes.coreSummary}>
          <code className={classes.coreName}>muster</code>
          <span className={classes.coreKind}>core / control plane</span>
        </Box>
      }
    >
      {authenticated && activeInstallation ? (
        <CoreFamiliesPanel installation={activeInstallation} />
      ) : (
        <Gate label="Authenticate to muster to inspect its core tools." />
      )}
    </DisclosureAccordion>
  );

  const renderGroup = ({ group, rows }: ToolGroupPartition, index: number) => {
    const { title, description } = TOOL_GROUPS[group];
    const families = rows.filter(row => row.kind === 'family').length;
    let action: ReactNode;
    if (index === 0) {
      action = (
        <FreshnessIndicator
          updatedAt={dataUpdatedAt}
          isRefreshing={isRefreshing}
          onRefresh={retry}
        />
      );
    } else if (group === 'registered') {
      // Registering a server is what fills this group -- the ad-hoc dialog
      // sits with it; the header's Register server button is the primary path.
      action = (
        <AddAdHocServerButton
          installation={activeInstallation}
          authenticated={authenticated}
        />
      );
    }
    const isAgentPlatform = group === 'agent-platform';

    return (
      <Box
        key={group}
        className={classes.section}
        component="section"
        aria-label={title}
      >
        <SectionHeader
          icon={GROUP_ICONS[group]}
          title={title}
          description={description}
          action={action}
        />
        {rows.length === 0 && !isAgentPlatform ? (
          <Typography variant="body2" color="textSecondary">
            {emptyGroupNote(group)}
          </Typography>
        ) : (
          <>
            {families > 0 && (
              <Typography variant="body2" className={classes.presentNote}>
                {families} {families === 1 ? 'family' : 'families'} across{' '}
                {fleetClusters.length}{' '}
                {fleetClusters.length === 1 ? 'cluster' : 'clusters'}.
              </Typography>
            )}
            <Box className={classes.stack}>
              {rows.map(renderRow)}
              {isAgentPlatform && coreRow}
            </Box>
          </>
        )}
      </Box>
    );
  };

  let body;
  if (isLoading || !activeInstallation) {
    body = isLoading ? (
      <Progress />
    ) : (
      <EmptyState
        missing="data"
        title="No muster installation"
        description="None of the installations this portal knows runs muster, so there are no aggregated MCP servers to list."
      />
    );
  } else if (mcpServers.length === 0) {
    body = (
      <EmptyState
        missing="data"
        title="No MCP servers"
        description="No MCPServer CRs found in this installation. The muster CRDs may not be installed, or the aggregator federates none yet."
      />
    );
  } else {
    body = (
      <Box className={classes.column}>
        {requiresAuth && !authenticated && (
          <Box className={classes.topGate}>
            <Gate
              label="Server topology is visible from the CRDs, but tools and core families require an authenticated muster session."
              action={
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  disabled={connecting}
                  startIcon={
                    connecting ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <Lock style={{ fontSize: 14 }} />
                    )
                  }
                  onClick={handleConnect}
                >
                  Connect to muster
                </Button>
              }
            />
          </Box>
        )}

        {partition.map(renderGroup)}
      </Box>
    );
  }

  return (
    <Content>
      <ActiveInstallationNote />
      {body}
    </Content>
  );
}
