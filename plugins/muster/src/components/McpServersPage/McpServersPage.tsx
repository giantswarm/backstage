import { useMemo } from 'react';
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
import { Content, EmptyState, Progress } from '@backstage/core-components';
import { InstallationPicker } from '../InstallationPicker';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { SectionHeader, Gate, DisclosureAccordion } from '../shared';
import { partitionServers } from '../../lib/serverGrouping';
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

export function McpServersPage() {
  const classes = useStyles();
  const { mcpServers, activeInstallation, activeInstallationInfo, isLoading } =
    useMusterInstance();

  const requiresAuth = activeInstallationInfo?.requiresAuth ?? false;

  // Session state (and the connect action) are resolved once via the shared
  // hook so the manager, the dashboard and the workflows page agree (ADR D3).
  const { authenticated, connecting, connect: handleConnect } =
    useMusterSession();

  const { standard, integration } = useMemo(
    () => partitionServers(mcpServers),
    [mcpServers],
  );

  const targetMcs = useMemo(
    () =>
      new Set(
        standard.flatMap(g =>
          g.servers
            .map(s => s.getManagementCluster())
            .filter((mc): mc is string => Boolean(mc)),
        ),
      ),
    [standard],
  );

  let body;
  if (isLoading || !activeInstallation) {
    body = isLoading ? (
      <Progress />
    ) : (
      <EmptyState
        missing="data"
        title="Select an installation"
        description="Choose a muster installation above to list its aggregated MCP servers."
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

        {/* Standard servers — federated across management clusters */}
        <Box className={classes.section}>
          <SectionHeader
            icon={<Dns />}
            title="Standard servers"
            description="muster federates the same backend MCP servers across the management clusters in this installation. Each family's tool surface is identical, so it is shown once; connection health is tracked per management cluster."
          />
          {standard.length === 0 ? (
            <Typography variant="body2" color="textSecondary">
              No federated (management-cluster-labelled) servers in this
              installation.
            </Typography>
          ) : (
            <>
              <Typography variant="body2" className={classes.presentNote}>
                {standard.length}{' '}
                {standard.length === 1 ? 'family' : 'families'} across{' '}
                {targetMcs.size} {targetMcs.size === 1 ? 'cluster' : 'clusters'}
                .
              </Typography>
              <Box className={classes.stack}>
                {standard.map(group => (
                  <StandardServerDisclosure
                    key={group.family}
                    family={group.family}
                    servers={group.servers}
                    activeInstallation={activeInstallation}
                    authenticated={authenticated}
                    defaultExpanded={false}
                  />
                ))}
              </Box>
            </>
          )}
        </Box>

        {/* Integration servers — singular, outside the MC structure */}
        <Box className={classes.section}>
          <SectionHeader
            icon={<Power />}
            title="Integration servers"
            description="Singular MCP servers muster fronts outside the management-cluster structure — customer integrations and shared services. Each carries its own endpoint, auth chain, and tool surface."
            action={
              <AddAdHocServerButton
                installation={activeInstallation}
                authenticated={authenticated}
              />
            }
          />
          {integration.length === 0 ? (
            <Typography variant="body2" color="textSecondary">
              No singular integration servers in this installation.
            </Typography>
          ) : (
            <Box className={classes.stack}>
              {integration.map(server => (
                <IntegrationServerDisclosure
                  key={`${server.cluster}/${server.getName()}`}
                  server={server}
                  authenticated={authenticated}
                />
              ))}
            </Box>
          )}
        </Box>

        {/* muster core — muster itself, as a server */}
        <Box className={classes.section}>
          <SectionHeader
            icon={<Build />}
            title="muster core"
            description="muster itself is an MCP server — it provides tools directly for managing workflows, services, configuration, MCP server definitions, and authentication. Always available wherever muster is reachable, grouped by family."
          />
          <Box className={classes.stack}>
            <DisclosureAccordion
              defaultExpanded={false}
              summary={
                <Box className={classes.coreSummary}>
                  <code className={classes.coreName}>muster</code>
                  <span className={classes.coreKind}>core / control plane</span>
                </Box>
              }
            >
              {authenticated ? (
                <CoreFamiliesPanel installation={activeInstallation} />
              ) : (
                <Gate label="Authenticate to muster to inspect its core tools." />
              )}
            </DisclosureAccordion>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Content>
      <InstallationPicker />
      {body}
    </Content>
  );
}
