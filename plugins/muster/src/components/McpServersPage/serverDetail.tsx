import { ReactNode } from 'react';
import { Box, Chip, Typography, makeStyles, Theme } from '@material-ui/core';
import { Link, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import { MCPServer, mcpServerStateSeverity } from '../../lib/k8s';
import { readProvenance, provenanceReleaseId } from '../../lib/gitops';
import {
  formatRelativeTime,
  formatTimestamp,
} from '../../lib/formatRelativeTime';
import { StateBadge } from '../shared';
import { severityTone } from '../shared';
import { toolExplorerRouteRef } from '../../routes';

const useStyles = makeStyles((theme: Theme) => ({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(120px, max-content) 1fr',
    columnGap: theme.spacing(2),
    rowGap: theme.spacing(0.5),
    alignItems: 'baseline',
  },
  key: {
    color: theme.palette.text.secondary,
    fontWeight: 500,
    fontSize: 13,
  },
  value: {
    fontSize: 13,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 12,
    wordBreak: 'break-all',
  },
  note: {
    color: theme.palette.text.secondary,
  },
  block: {
    marginBottom: theme.spacing(2),
  },
  blockTitle: {
    fontWeight: 600,
    marginBottom: theme.spacing(1),
  },
  toolList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.75),
    marginTop: theme.spacing(1),
  },
  errorPre: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'monospace',
    fontSize: 12,
    margin: 0,
    padding: theme.spacing(1.25),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.action.hover,
  },
}));

export function DefRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const classes = useStyles();
  return (
    <>
      <span className={classes.key}>{label}</span>
      <span className={classes.value}>{children}</span>
    </>
  );
}

/** A small captioned sub-section inside a disclosure body. */
export function DetailBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const classes = useStyles();
  return (
    <Box className={classes.block}>
      <Typography variant="body2" className={classes.blockTitle}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

/** CRD-sourced configuration (always available, no muster session needed). */
export function ServerConfig({ server }: { server: MCPServer }) {
  const classes = useStyles();
  return (
    <Box className={classes.grid}>
      <DefRow label="Type">{server.getType() ?? '-'}</DefRow>
      <DefRow label="Family">{server.getFamily() ?? '-'}</DefRow>
      {server.getManagementCluster() && (
        <DefRow label="Target MC">{server.getManagementCluster()}</DefRow>
      )}
      {server.getUrl() && (
        <DefRow label="URL">
          <span className={classes.mono}>{server.getUrl()}</span>
        </DefRow>
      )}
      {server.getTimeout() !== undefined && (
        <DefRow label="Timeout">{server.getTimeout()}s</DefRow>
      )}
      <DefRow label="Auto start">{server.getAutoStart() ? 'yes' : 'no'}</DefRow>
    </Box>
  );
}

/** The per-server auth/token chain recovered from `spec.auth`. */
export function AuthChain({ server }: { server: MCPServer }) {
  const classes = useStyles();
  const auth = server.getAuth();

  if (!auth || auth.type === 'none' || auth.type === undefined) {
    return (
      <Typography variant="body2" className={classes.note}>
        No authentication configured (anonymous).
      </Typography>
    );
  }

  const { tokenExchange, localMint, authorizationServer } = auth;

  return (
    <Box className={classes.grid}>
      <DefRow label="Type">{auth.type}</DefRow>
      <DefRow label="Forward token">{auth.forwardToken ? 'yes' : 'no'}</DefRow>
      {auth.requiredAudiences && auth.requiredAudiences.length > 0 && (
        <DefRow label="Required audiences">
          <span className={classes.mono}>
            {auth.requiredAudiences.join(', ')}
          </span>
        </DefRow>
      )}
      {authorizationServer && (
        <DefRow label="Authorization server">
          <span className={classes.mono}>{authorizationServer.issuer}</span>
          {authorizationServer.scopes ? ` (${authorizationServer.scopes})` : ''}
        </DefRow>
      )}
      {tokenExchange?.enabled && (
        <>
          {tokenExchange.connectorId && (
            <DefRow label="TE connector">{tokenExchange.connectorId}</DefRow>
          )}
          {tokenExchange.dexTokenEndpoint && (
            <DefRow label="Dex endpoint">
              <span className={classes.mono}>
                {tokenExchange.dexTokenEndpoint}
              </span>
            </DefRow>
          )}
          {tokenExchange.expectedIssuer && (
            <DefRow label="Expected issuer">
              <span className={classes.mono}>
                {tokenExchange.expectedIssuer}
              </span>
            </DefRow>
          )}
          {tokenExchange.scopes && (
            <DefRow label="TE scopes">{tokenExchange.scopes}</DefRow>
          )}
        </>
      )}
      {localMint?.enabled && (
        <DefRow label="Local mint">
          audience{' '}
          <span className={classes.mono}>{localMint.audience ?? '-'}</span>
        </DefRow>
      )}
    </Box>
  );
}

/**
 * CRD `.status` diagnostics for an unhealthy server -- why it's unreachable,
 * how long it's been down, and when muster will retry. Ported from the mockup's
 * HealthDetails, sourced from the CR (always available, no muster session).
 */
export function HealthDetails({ server }: { server: MCPServer }) {
  const classes = useStyles();
  const lastConnected = server.getLastConnected();
  const consecutiveFailures = server.getConsecutiveFailures();
  const nextRetry = server.getNextRetryAfter();
  const lastError = server.getLastError();

  return (
    <Box>
      <Box className={classes.grid}>
        {lastConnected && (
          <DefRow label="Last connected">
            {formatRelativeTime(lastConnected)}{' '}
            <span className={classes.note}>
              ({formatTimestamp(lastConnected)})
            </span>
          </DefRow>
        )}
        {typeof consecutiveFailures === 'number' && consecutiveFailures > 0 && (
          <DefRow label="Consecutive failures">{consecutiveFailures}</DefRow>
        )}
        {nextRetry && (
          <DefRow label="Next retry">
            {formatRelativeTime(nextRetry)}{' '}
            <span className={classes.note}>({formatTimestamp(nextRetry)})</span>
          </DefRow>
        )}
      </Box>
      {lastError && (
        <Box mt={1}>
          <Typography variant="caption" className={classes.note}>
            Last error
          </Typography>
          <pre className={classes.errorPre}>{lastError}</pre>
        </Box>
      )}
    </Box>
  );
}

/**
 * Live runtime view from the muster aggregator (`core_mcpserver_list`), keyed
 * per installation so several expanded rows share one request. Degrades to an
 * inline note when muster is unreachable / auth-required.
 */
export function RuntimeState({ server }: { server: MCPServer }) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const installation = server.cluster;
  const name = server.getName();

  const { data, isLoading, error } = useQuery({
    queryKey: ['muster', 'servers', installation],
    queryFn: () => musterApi.listServers(installation),
  });

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return (
      <Typography variant="body2" className={classes.note}>
        Live runtime state unavailable: {(error as Error).message}
      </Typography>
    );
  }

  const runtime = (data?.mcpServers ?? []).find(s => s.name === name);
  if (!runtime) {
    return (
      <Typography variant="body2" className={classes.note}>
        Server not present in the aggregator's runtime list.
      </Typography>
    );
  }

  return (
    <Box className={classes.grid}>
      <DefRow label="Live state">
        {runtime.state ? (
          <StateBadge
            tone={severityTone(mcpServerStateSeverity(runtime.state as never))}
            label={runtime.state}
          />
        ) : (
          '-'
        )}
      </DefRow>
      {runtime.statusMessage && (
        <DefRow label="Status">{runtime.statusMessage}</DefRow>
      )}
      {runtime.sessionStatus && (
        <DefRow label="Session">{runtime.sessionStatus}</DefRow>
      )}
      {runtime.sessionAuth && (
        <DefRow label="Session auth">{runtime.sessionAuth}</DefRow>
      )}
      {runtime.toolsCount !== undefined && (
        <DefRow label="Tools (session)">{runtime.toolsCount}</DefRow>
      )}
      {runtime.consecutiveFailures ? (
        <DefRow label="Consecutive failures">
          {runtime.consecutiveFailures}
        </DefRow>
      ) : null}
      {runtime.nextRetryAfter && (
        <DefRow label="Next retry">
          {formatTimestamp(runtime.nextRetryAfter)}
        </DefRow>
      )}
      {runtime.connectedAt && (
        <DefRow label="Connected at">
          {formatTimestamp(runtime.connectedAt)}
        </DefRow>
      )}
      {runtime.error && (
        <DefRow label="Error">
          <span className={classes.mono}>{runtime.error}</span>
        </DefRow>
      )}
    </Box>
  );
}

/**
 * Tools this server contributes to the aggregated catalogue, discovered lazily
 * via `filter_tools(pattern="<prefix>_*")`. Each chip links to the tool
 * explorer scoped to the same installation + server. `prefixOverride` lets a
 * family-grouped (standard) server filter by `x_<family>_*` instead of the
 * single CR's name-derived prefix.
 */
export function ServerTools({
  server,
  prefixOverride,
}: {
  server: MCPServer;
  prefixOverride?: string;
}) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const toolExplorerRoute = useRouteRef(toolExplorerRouteRef);
  const installation = server.cluster;
  const prefix = prefixOverride ?? server.getToolNamePrefix();
  const pattern = `${prefix}_*`;

  const { data, isLoading, error } = useQuery({
    queryKey: ['muster', 'server-tools', installation, pattern],
    queryFn: () => musterApi.filterTools({ installation, pattern, limit: 200 }),
  });

  const explorerLink = (toolName?: string) => {
    const base = toolExplorerRoute?.() ?? '#';
    const params = new URLSearchParams();
    if (installation) {
      params.set('installation', installation);
    }
    params.set('server', server.getName());
    if (toolName) {
      params.set('tool', toolName);
    }
    return `${base}?${params.toString()}`;
  };

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return (
      <Typography variant="body2" className={classes.note}>
        Tools unavailable: {(error as Error).message}
      </Typography>
    );
  }

  const tools = data?.tools ?? [];
  if (tools.length === 0) {
    return (
      <Typography variant="body2" className={classes.note}>
        No tools exposed (server may be down or require authentication).
      </Typography>
    );
  }

  return (
    <Box>
      <Typography variant="body2" className={classes.note}>
        {data?.total ?? tools.length} tool(s) under{' '}
        <span className={classes.mono}>{pattern}</span>
        {data?.truncated ? ' (first page)' : ''} —{' '}
        <Link to={explorerLink()}>open in tool explorer</Link>
      </Typography>
      <Box className={classes.toolList}>
        {tools.map(tool => (
          <Link key={tool.name} to={explorerLink(tool.name)}>
            <Chip
              size="small"
              clickable
              label={
                tool.name.startsWith(`${prefix}_`)
                  ? tool.name.slice(prefix.length + 1)
                  : tool.name
              }
              title={tool.summary ?? tool.description ?? tool.name}
            />
          </Link>
        ))}
      </Box>
    </Box>
  );
}

/** GitOps provenance, with the managing HelmRelease/Kustomization surfaced. */
export function Provenance({ server }: { server: MCPServer }) {
  const classes = useStyles();
  const p = readProvenance(server);
  const releaseId = provenanceReleaseId(p);

  if (!releaseId && !p.managedBy) {
    return (
      <Typography variant="body2" className={classes.note}>
        No GitOps provenance labels found -- this looks like an ad-hoc server.
      </Typography>
    );
  }

  return (
    <Box className={classes.grid}>
      {p.managedBy && <DefRow label="Managed by">{p.managedBy}</DefRow>}
      {(p.helmRelease ?? p.fluxHelmRelease) && (
        <DefRow label="HelmRelease">
          <span className={classes.mono}>{releaseId}</span>
        </DefRow>
      )}
      {p.fluxKustomization && (
        <DefRow label="Flux kustomization">
          <span className={classes.mono}>{p.fluxKustomization}</span>
        </DefRow>
      )}
    </Box>
  );
}
