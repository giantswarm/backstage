import { ReactNode, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Typography,
  makeStyles,
  useTheme,
  Theme,
} from '@material-ui/core';
import Dns from '@material-ui/icons/Dns';
import AccountTree from '@material-ui/icons/AccountTree';
import ArrowForward from '@material-ui/icons/ArrowForward';
import VerifiedUser from '@material-ui/icons/VerifiedUser';
import Lock from '@material-ui/icons/Lock';
import { Content, Link, Progress } from '@backstage/core-components';
import { identityApiRef, useApi } from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { useMusterInstance } from '../MusterInstanceProvider';
import { InstallationPicker } from '../InstallationPicker';
import { FleetHealthMatrix } from './FleetHealthMatrix';
import { SectionHeader, Stat, StateBadge } from '../shared';
import { mcpServerStateSeverity } from '../../lib/k8s';
import { musterApiRef } from '../../apis';
import { mcpServersRouteRef, workflowsRouteRef } from '../../routes';

// muster identity, ported verbatim from the mockup's `lib/mock/mcp-servers.ts`
// so the overview reads identically; the per-instance endpoint comes from the
// backend config (activeInstallationInfo.endpoint), not this literal.
const MUSTER_IDENTITY = {
  name: 'muster',
  tagline: 'MCP aggregator & control plane',
  description:
    "A single MCP endpoint that aggregates the tools of many backend MCP servers running across Giant Swarm management clusters, plus muster's own core tools and reusable workflows. Agents connect once to muster and reach everything behind it.",
};

const MUSTER_ICON_LIGHT = 'https://s.giantswarm.io/app-icons/muster/1/light.svg';
const MUSTER_ICON_DARK = 'https://s.giantswarm.io/app-icons/muster/1/dark.svg';

const useStyles = makeStyles((theme: Theme) => ({
  // Reading-capped column (mockup `max-w-5xl`).
  column: {
    maxWidth: 1024,
  },
  intro: {
    maxWidth: '70ch',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(4),
  },
  identityHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1.5),
    marginBottom: theme.spacing(2.5),
  },
  appIcon: {
    flexShrink: 0,
    width: 36,
    height: 36,
    marginTop: 2,
  },
  identityTitle: {
    fontWeight: 600,
    lineHeight: 1.3,
  },
  identityDescription: {
    marginTop: theme.spacing(0.5),
    maxWidth: '70ch',
    color: theme.palette.text.secondary,
  },
  // Cards: outlined, rounded, no heavy shadow (mockup `rounded-xl border bg-card`).
  card: {
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius * 2,
  },
  identityTopRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
  },
  taglineBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 20,
    width: 'fit-content',
    padding: theme.spacing(0, 0.75),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.action.selected,
    color: theme.palette.text.secondary,
    fontSize: 11,
  },
  endpoint: {
    marginTop: theme.spacing(1),
    display: 'block',
    wordBreak: 'break-all',
    fontFamily: 'monospace',
    fontSize: 13,
    color: theme.palette.text.secondary,
  },
  authBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: theme.spacing(0.75),
    [theme.breakpoints.up('sm')]: {
      alignItems: 'flex-end',
    },
  },
  authMeta: {
    fontSize: 11,
    color: theme.palette.text.secondary,
  },
  statRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: theme.spacing(1.5, 6),
    marginTop: theme.spacing(2.5),
    paddingTop: theme.spacing(2),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  browseHeading: {
    marginBottom: theme.spacing(1.5),
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: theme.palette.text.secondary,
  },
  browseGrid: {
    display: 'grid',
    gap: theme.spacing(1.5),
    [theme.breakpoints.up('sm')]: {
      gridTemplateColumns: '1fr 1fr',
    },
  },
  browseLink: {
    display: 'block',
    '&:hover': {
      textDecoration: 'none',
    },
  },
  browseCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1.5),
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius * 2,
    transition: 'background-color 120ms',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  browseIcon: {
    flexShrink: 0,
    width: 32,
    height: 32,
    marginTop: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.action.hover,
    color: theme.palette.text.secondary,
    '& svg': { fontSize: 18 },
  },
  browseBody: {
    minWidth: 0,
    flex: 1,
  },
  browseTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
  },
  browseTitle: {
    fontWeight: 600,
  },
  browseArrow: {
    flexShrink: 0,
    fontSize: 18,
    color: theme.palette.text.secondary,
  },
  browseDescription: {
    marginTop: theme.spacing(0.5),
    color: theme.palette.text.secondary,
  },
  browseCount: {
    marginTop: theme.spacing(1),
    display: 'block',
    fontVariantNumeric: 'tabular-nums',
    color: theme.palette.text.secondary,
  },
  section: {
    marginTop: theme.spacing(5),
  },
}));

/** Append `?installation=` to a route path so deep links keep the instance. */
function withInstallation(base: string, installation?: string): string {
  if (!installation) {
    return base;
  }
  const params = new URLSearchParams({ installation });
  return `${base}?${params.toString()}`;
}

function BrowseCard({
  to,
  icon,
  title,
  description,
  count,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  description: string;
  count: string;
}) {
  const classes = useStyles();
  return (
    <Link to={to} className={classes.browseLink}>
      <Paper variant="outlined" className={classes.browseCard}>
        <span className={classes.browseIcon}>{icon}</span>
        <Box className={classes.browseBody}>
          <Box className={classes.browseTitleRow}>
            <Typography variant="subtitle1" className={classes.browseTitle}>
              {title}
            </Typography>
            <ArrowForward className={classes.browseArrow} />
          </Box>
          <Typography variant="body2" className={classes.browseDescription}>
            {description}
          </Typography>
          <Typography variant="caption" className={classes.browseCount}>
            {count}
          </Typography>
        </Box>
      </Paper>
    </Link>
  );
}

export function DashboardPage() {
  const classes = useStyles();
  const theme = useTheme();
  const {
    activeInstallation,
    activeInstallationInfo,
    mcpServers,
    workflows,
    isLoading,
  } = useMusterInstance();
  const musterApi = useApi(musterApiRef);
  const identityApi = useApi(identityApiRef);
  const mcpServersLink = useRouteRef(mcpServersRouteRef);
  const workflowsLink = useRouteRef(workflowsRouteRef);

  const requiresAuth = activeInstallationInfo?.requiresAuth ?? false;

  // The logged-in Backstage identity, shown in the "Authenticated as" badge.
  const { data: profile } = useQuery({
    queryKey: ['muster', 'identity'],
    queryFn: () => identityApi.getProfileInfo(),
  });
  const userLabel = profile?.displayName ?? profile?.email ?? 'you';

  // Live aggregator probe: the tool count (the only stat that needs the muster
  // session) and, by succeeding at all, that the session is authenticated. One
  // round-trip; failing with an auth error flips the card to "Not authenticated".
  const {
    data: overview,
    isError: overviewFailed,
    isLoading: overviewLoading,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['muster', 'overview', activeInstallation],
    queryFn: () =>
      musterApi.filterTools({ installation: activeInstallation, limit: 1 }),
    enabled: Boolean(activeInstallation),
  });

  const [connecting, setConnecting] = useState(false);
  const handleConnect = async () => {
    setConnecting(true);
    try {
      await musterApi.signIn();
      await refetchOverview();
    } finally {
      setConnecting(false);
    }
  };

  // Authenticated when no auth is required, or the live probe succeeded.
  const authenticated = !requiresAuth || (!overviewFailed && Boolean(overview));
  const toolCount = overview?.total;

  // ponytail: aggregator "servers connected" is derived from the CRD
  // `.status.state` (always readable, no muster session), not a dedicated
  // core_service_list call. The connected/total figures match what
  // core_service_list reports; upgrade path is a backend /overview route
  // surfacing the aggregator service's live servers_connected + tools.
  const serversConnected = mcpServers.filter(
    s => mcpServerStateSeverity(s.getState()) === 'ok',
  ).length;

  return (
    <Content>
      <InstallationPicker />

      {isLoading || !activeInstallation ? (
        <Progress />
      ) : (
        <Box className={classes.column}>
          <Typography variant="body2" className={classes.intro}>
            The live inventory of everything the platform&apos;s agents can
            reach right now — the MCP servers, their tools, and the reusable
            workflows provided through muster. This view is scoped to the
            selected installation and your authenticated muster session.
          </Typography>

          {/* muster identity */}
          <Box className={classes.identityHeader}>
            <img
              src={
                theme.palette.type === 'dark'
                  ? MUSTER_ICON_DARK
                  : MUSTER_ICON_LIGHT
              }
              alt=""
              className={classes.appIcon}
            />
            <Box>
              <Typography variant="subtitle1" className={classes.identityTitle}>
                {MUSTER_IDENTITY.name}
              </Typography>
              <Typography variant="body2" className={classes.identityDescription}>
                {MUSTER_IDENTITY.description}
              </Typography>
            </Box>
          </Box>

          <Paper variant="outlined" className={classes.card}>
            <Box className={classes.identityTopRow}>
              <Box display="flex" flexDirection="column">
                <span className={classes.taglineBadge}>
                  {MUSTER_IDENTITY.tagline}
                </span>
                <code className={classes.endpoint}>
                  {activeInstallationInfo?.endpoint ??
                    `${activeInstallation} (endpoint not configured)`}
                </code>
              </Box>

              <Box className={classes.authBlock}>
                {authenticated ? (
                  <>
                    <StateBadge
                      tone="ok"
                      label={`Authenticated as ${userLabel}`}
                    />
                    <span className={classes.authMeta}>
                      <VerifiedUser
                        style={{ fontSize: 12, verticalAlign: 'text-bottom' }}
                      />{' '}
                      live muster session
                    </span>
                  </>
                ) : (
                  <>
                    <StateBadge tone="warning" label="Not authenticated" />
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      startIcon={
                        connecting ? (
                          <CircularProgress size={14} color="inherit" />
                        ) : (
                          <Lock style={{ fontSize: 14 }} />
                        )
                      }
                      disabled={connecting}
                      onClick={handleConnect}
                    >
                      Connect to muster
                    </Button>
                  </>
                )}
              </Box>
            </Box>

            <Box className={classes.statRow}>
              <Stat label="Aggregated servers" value={mcpServers.length} />
              <Stat
                label="Tools"
                value={
                  authenticated
                    ? overviewLoading
                      ? '…'
                      : toolCount ?? '—'
                    : '—'
                }
              />
              <Stat label="Workflows" value={workflows.length} />
              {authenticated && (
                <Stat
                  label="Servers connected"
                  value={`${serversConnected}/${mcpServers.length}`}
                  tone={
                    serversConnected === mcpServers.length ? 'ok' : 'warning'
                  }
                />
              )}
            </Box>
          </Paper>

          {/* Browse */}
          <Box className={classes.section}>
            <Typography variant="caption" className={classes.browseHeading}>
              Browse
            </Typography>
            <Box className={classes.browseGrid}>
              <BrowseCard
                to={withInstallation(
                  mcpServersLink?.() ?? '#',
                  activeInstallation,
                )}
                icon={<Dns />}
                title="MCP servers"
                description="The MCP servers muster aggregates and the tools they expose, with per-cluster health."
                count={`${mcpServers.length} servers`}
              />
              <BrowseCard
                to={withInstallation(
                  workflowsLink?.() ?? '#',
                  activeInstallation,
                )}
                icon={<AccountTree />}
                title="Workflows"
                description="Reusable, named compositions of tool calls — searchable and filterable by availability."
                count={`${workflows.length} workflows`}
              />
            </Box>
          </Box>

          {/* Fleet health matrix — within this instance */}
          <Box className={classes.section}>
            <SectionHeader
              icon={<Dns />}
              title="Fleet health"
              description="MCPServer state across the management clusters this muster federates, by family. Each cell is the worst state in that cluster × family intersection."
            />
            <FleetHealthMatrix servers={mcpServers} />
          </Box>
        </Box>
      )}
    </Content>
  );
}
