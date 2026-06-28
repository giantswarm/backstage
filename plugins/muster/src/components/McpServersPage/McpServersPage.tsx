import { useMemo, useState } from 'react';
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
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { InstallationPicker } from '../InstallationPicker';
import { useMusterInstance } from '../MusterInstanceProvider';
import { SectionHeader, Gate, DisclosureAccordion } from '../shared';
import { MCPServer } from '../../lib/k8s';
import { musterApiRef } from '../../apis';
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

type StandardGroup = { family: string; servers: MCPServer[] };

/**
 * Partition the active instance's MCPServer CRs into the mockup's two server
 * shapes: standard servers (a `spec.family.name` groups equivalent instances
 * federated across management clusters; tool surface shown once, health per MC)
 * and integration servers (singular servers with no family -- customer
 * integrations and shared services). Family presence is the discriminator: the
 * management-cluster label is set on both, but only the federated standard
 * servers carry a family.
 */
function partitionServers(servers: MCPServer[]): {
  standard: StandardGroup[];
  integration: MCPServer[];
} {
  const standardByFamily = new Map<string, MCPServer[]>();
  const integration: MCPServer[] = [];

  for (const server of servers) {
    const family = server.getFamily();
    if (family) {
      standardByFamily.set(family, [
        ...(standardByFamily.get(family) ?? []),
        server,
      ]);
    } else {
      integration.push(server);
    }
  }

  const standard = [...standardByFamily.entries()]
    .map(([family, group]) => ({ family, servers: group }))
    .sort((a, b) => a.family.localeCompare(b.family));
  integration.sort((a, b) => a.getName().localeCompare(b.getName()));

  return { standard, integration };
}

export function McpServersPage() {
  const classes = useStyles();
  const { mcpServers, activeInstallation, activeInstallationInfo, isLoading } =
    useMusterInstance();
  const musterApi = useApi(musterApiRef);

  const requiresAuth = activeInstallationInfo?.requiresAuth ?? false;

  // Live probe: one round-trip that doubles as the auth check (a 401/403 flips
  // the page to the not-authenticated state). Same pattern as the dashboard.
  const {
    data: probe,
    isError: probeFailed,
    refetch,
  } = useQuery({
    queryKey: ['muster', 'overview', activeInstallation],
    queryFn: () =>
      musterApi.filterTools({ installation: activeInstallation, limit: 1 }),
    enabled: Boolean(activeInstallation),
  });

  const authenticated = !requiresAuth || (!probeFailed && Boolean(probe));

  const [connecting, setConnecting] = useState(false);
  const handleConnect = async () => {
    setConnecting(true);
    try {
      await musterApi.signIn();
      await refetch();
    } finally {
      setConnecting(false);
    }
  };

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
            action={<AddAdHocServerButton installation={activeInstallation} />}
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
