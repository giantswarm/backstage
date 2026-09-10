import {
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Paper,
  Typography,
  makeStyles,
  useTheme,
  Theme,
} from '@material-ui/core';
import DeviceHub from '@material-ui/icons/DeviceHub';
import Extension from '@material-ui/icons/Extension';
import VerifiedUser from '@material-ui/icons/VerifiedUser';
import Lock from '@material-ui/icons/Lock';
import { Content, Progress } from '@backstage/core-components';
import { identityApiRef, useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import {
  isUnreachableSession,
  sessionGateCopy,
  useMusterInstance,
  useMusterSession,
} from '../MusterInstanceProvider';
import { ActiveInstallationNote } from '../ActiveInstallationNote';
import { MusterProviders } from '../MusterProviders';
import { CapabilitySurface } from './CapabilitySurface';
import { FleetCoverage } from './FleetCoverage';
import { InventoryBreakdown } from './InventoryBreakdown';
import { UsageSection } from './UsageSection';
import {
  FreshnessIndicator,
  SectionHeader,
  SessionGate,
  Stat,
  StateBadge,
} from '../shared';
import { serversHealthSummary } from '../../lib/k8s';
import { musterApiRef } from '../../apis';

// muster identity, ported verbatim from the mockup's `lib/mock/mcp-servers.ts`
// so the overview reads identically; the per-instance endpoint comes from the
// backend config (activeInstallationInfo.endpoint), not this literal.
//
// `name` doubles as the dashboard's `h2` below, which is why it stays a plain
// noun rather than a sentence.
const MUSTER_IDENTITY = {
  name: 'muster',
  tagline: 'MCP aggregator & control plane',
  description:
    "A single MCP endpoint that aggregates the tools of many backend MCP servers running across Giant Swarm management clusters, plus muster's own core tools and reusable workflows. Agents connect once to muster and reach everything behind it.",
};

const MUSTER_ICON_LIGHT =
  'https://s.giantswarm.io/app-icons/muster/1/light.svg';
const MUSTER_ICON_DARK = 'https://s.giantswarm.io/app-icons/muster/1/dark.svg';

const useStyles = makeStyles((theme: Theme) => ({
  // Reading-capped column (mockup `max-w-5xl`).
  column: {
    maxWidth: 1024,
  },
  // Thin progress bar shown under the header while the live CRD read is in
  // flight, so a cold fleet warm-up does not blank the whole body.
  bodyProgress: {
    marginBottom: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
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
  section: {
    marginTop: theme.spacing(5),
  },
}));

function McpDashboardBody() {
  const classes = useStyles();
  const theme = useTheme();
  const {
    activeInstallation,
    activeInstallationInfo,
    mcpServers,
    workflows,
    isLoading,
    dataUpdatedAt,
    isRefreshing,
    retry,
  } = useMusterInstance();
  const musterApi = useApi(musterApiRef);
  const identityApi = useApi(identityApiRef);

  // The logged-in Backstage identity, shown in the "Authenticated as" badge.
  const { data: profile } = useQuery({
    queryKey: ['muster', 'identity'],
    queryFn: () => identityApi.getProfileInfo(),
  });
  const userLabel = profile?.displayName ?? profile?.email ?? 'you';

  // Session state (authenticated + connect) comes from the shared hook so the
  // dashboard, the MCP-servers manager and the workflows page agree (ADR D3).
  // The hook's probe and the count query below share the
  // `['muster', 'overview', <installation>]` key, so react-query dedupes them to
  // one round-trip and a connect refetch updates both.
  const session = useMusterSession();
  const { authenticated, connecting, connect: handleConnect } = session;
  const sessionCopy = sessionGateCopy(session, activeInstallation);

  // The tool count is the only stat that needs the muster session; read it from
  // the (deduped) overview query rather than the session hook, which only
  // exposes auth state. Like the hook's probe, it is not run at all for an
  // installation the backend reports as not reachable from this portal: the
  // request could only time out and land as a 500 in Sentry.
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['muster', 'overview', activeInstallation],
    queryFn: () =>
      musterApi.filterTools({ installation: activeInstallation, limit: 1 }),
    enabled: Boolean(activeInstallation) && !isUnreachableSession(session),
  });
  const toolCount = overview?.total;

  // Tools stat: '—' when unauthenticated, '…' while the probe is in flight,
  // else the live count (or '—' if muster reported none).
  let toolStat: string | number = '—';
  if (authenticated) {
    toolStat = overviewLoading ? '…' : (toolCount ?? '—');
  }

  // ponytail: aggregator "servers healthy" is derived from the CRD
  // `.status.state` severity (always readable, no muster session), not a
  // dedicated core_service_list call. `Auth Required` counts as healthy (the
  // browsing user has a session); only genuinely degraded states subtract. The
  // tone warns only when a meaningful fraction is unhealthy, so a single remote
  // federated backend being down does not paint the stat permanently amber.
  // Upgrade path is a backend /overview route surfacing the aggregator
  // service's live servers_connected + tools.
  const { healthy: serversHealthy, tone: serversHealthyTone } =
    serversHealthSummary(mcpServers);

  // On a cold load the single-cluster CRD read can be queued behind the
  // whole-fleet auth warm-up. Rather than blank the whole body behind a
  // full-page spinner, render the page chrome immediately from whatever
  // persisted/last-known data react-query restored, and show placeholders +
  // a thin progress bar only for the stats/health that have not arrived yet.
  // (The root-cause serialization fix ships separately in plugins/gs.)
  const serversPending = isLoading && mcpServers.length === 0;
  const workflowsPending = isLoading && workflows.length === 0;

  return (
    <Content>
      <ActiveInstallationNote />

      {!activeInstallation ? (
        <Progress />
      ) : (
        <Box className={classes.column}>
          {isLoading && (
            <LinearProgress
              className={classes.bodyProgress}
              aria-label="Loading live muster data"
            />
          )}
          <Typography variant="body2" className={classes.intro}>
            What the platform&apos;s agents can reach through muster right now —
            the MCP servers, their tools and the reusable workflows — and the
            tool calls actually dispatched through it. Scoped to the selected
            installation and your authenticated muster session. Browse and
            manage any of it on the MCP Servers tab.
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
              {/* The dashboard's own heading, and the only `h2` on it: the
                  level-2 tab above says "MCP", the tree below hangs off this.
                  `component`, not `variant` — the look is unchanged. */}
              <Typography
                variant="subtitle1"
                component="h2"
                className={classes.identityTitle}
              >
                {MUSTER_IDENTITY.name}
              </Typography>
              <Typography
                variant="body2"
                className={classes.identityDescription}
              >
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
                {activeInstallationInfo?.source && (
                  <Typography variant="caption" color="textSecondary">
                    {activeInstallationInfo.source === 'derived'
                      ? 'Endpoint derived from the installation base domain'
                      : 'Endpoint from the portal configuration'}
                  </Typography>
                )}
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
                    <StateBadge
                      tone={session.pending ? 'neutral' : 'warning'}
                      label={sessionCopy.badge}
                    />
                    <span className={classes.authMeta}>
                      {sessionCopy.sentence}
                    </span>
                    {sessionCopy.action && (
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
                        {connecting ? 'Connecting…' : sessionCopy.action}
                      </Button>
                    )}
                  </>
                )}
              </Box>
            </Box>

            <Box className={classes.statRow}>
              <Stat
                label="Aggregated servers"
                value={serversPending ? '…' : mcpServers.length}
              />
              <Stat label="Tools" value={toolStat} />
              <Stat
                label="Workflows"
                value={workflowsPending ? '…' : workflows.length}
              />
              {/* Computed from the CRD reads, not the muster session, so it
                  renders whenever the server list has loaded -- the same data
                  the fleet coverage below reads unauthenticated. */}
              <Stat
                label="Servers healthy"
                value={
                  serversPending
                    ? '…'
                    : `${serversHealthy}/${mcpServers.length}`
                }
                tone={serversPending ? undefined : serversHealthyTone}
              />
            </Box>
          </Paper>

          {/* Tool calls — the headline signal, directly under the stats that
              say what there is to call. Read through the muster session like
              the Tools stat, and gated the same way inside the section. */}
          <Box className={classes.section}>
            <UsageSection />
          </Box>

          {/* Capability surface — what agents can reach, per server group.
              Session-scoped like the Tools stat, hence gated. */}
          <Box className={classes.section}>
            <SectionHeader
              as="h3"
              icon={<Extension />}
              title="Capability surface"
              description="What agents can reach through this muster: the tools, resources and prompts each server contributes to the aggregated catalogue, and muster's own core tools."
            />
            {authenticated ? (
              <CapabilitySurface
                servers={mcpServers}
                installation={activeInstallation}
              />
            ) : (
              <SessionGate
                session={session}
                installation={activeInstallation}
                context="Counting the tools, resources and prompts each server contributes needs a live muster session."
              />
            )}
          </Box>

          {/* Fleet coverage — CRD reads, no session. Coverage (where a family
              is deployed) is the fact the servers page's per-cluster pills
              cannot show; the full per-cluster picture lives there. */}
          <Box className={classes.section}>
            <SectionHeader
              as="h3"
              icon={<DeviceHub />}
              title="Fleet coverage"
              description="How far each server family reaches across the management clusters this installation federates. A family missing from a cluster is not deployed there; a degraded cluster has it deployed but not connected. Expand a family on the MCP servers page for every cluster."
              action={
                <FreshnessIndicator
                  updatedAt={dataUpdatedAt}
                  isRefreshing={isRefreshing}
                  onRefresh={retry}
                />
              }
            />
            {serversPending ? (
              <Typography variant="body2" color="textSecondary">
                Loading fleet coverage…
              </Typography>
            ) : (
              <FleetCoverage servers={mcpServers} />
            )}
          </Box>

          {/* Provenance & authentication — the governance view, CRD reads. */}
          <Box className={classes.section}>
            <SectionHeader
              as="h3"
              icon={<VerifiedUser />}
              title="Provenance & authentication"
              description="How the servers and workflows in this installation are managed, and how the servers' users authenticate. GitOps-managed resources are read-only here and change through a PR; live-registered ones can be edited in place."
            />
            {serversPending ? (
              <Typography variant="body2" color="textSecondary">
                Loading inventory…
              </Typography>
            ) : (
              <InventoryBreakdown servers={mcpServers} workflows={workflows} />
            )}
          </Box>
        </Box>
      )}
    </Content>
  );
}

/**
 * The "MCP" dashboard of the Agent Platform's Dashboards tab: the muster
 * aggregator this installation runs — what agents can reach through it, how
 * healthy it is, and the tool calls dispatched through it.
 *
 * It used to be the "Dashboard" view of muster's own "MCP Servers" tab, with
 * the tool-call numbers on a separate Usage page. Both moved here so the
 * section has **one** place that answers "how is the platform doing" — the
 * Dashboards tab — and the MCP Servers tab is left as what its name says: the
 * servers, workflows and tools themselves. The `Browse` cards went with the
 * move: on a landing page for that tab they were navigation, here they would
 * duplicate the tab strip two rows up.
 *
 * Contributed to `sub-page:agent-platform/dashboards` (see
 * `../../mcpDashboard`) rather than imported by that plugin, so neither plugin
 * depends on the other. It therefore brings its own `MusterProviders`: that
 * stack is designed to be mounted per view — the QueryClient is a module
 * singleton and the active installation lives in the URL plus localStorage — so
 * mounting it here is a cache read, not a refetch.
 */
export function McpDashboard() {
  return (
    <MusterProviders>
      <McpDashboardBody />
    </MusterProviders>
  );
}
