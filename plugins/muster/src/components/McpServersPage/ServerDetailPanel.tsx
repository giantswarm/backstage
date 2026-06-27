import { ReactNode } from 'react';
import { Box, Chip, Grid, Typography, makeStyles } from '@material-ui/core';
import {
  InfoCard,
  Link,
  Progress,
  StatusAborted,
  StatusError,
  StatusOK,
  StatusPending,
  StatusWarning,
} from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import { MCPServer, mcpServerStateSeverity } from '../../lib/k8s';
import { toolExplorerRouteRef } from '../../routes';

const useStyles = makeStyles(theme => ({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(140px, max-content) 1fr',
    columnGap: theme.spacing(2),
    rowGap: theme.spacing(0.5),
    alignItems: 'baseline',
  },
  key: {
    color: theme.palette.text.secondary,
    fontWeight: 500,
  },
  mono: {
    fontFamily: 'monospace',
    wordBreak: 'break-all',
  },
  section: {
    marginTop: theme.spacing(1),
  },
  toolList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  note: {
    color: theme.palette.text.secondary,
  },
}));

/** Renders a status chip for a muster infra/session state string. */
function StateBadge({ state }: { state?: string }) {
  if (!state) {
    return <StatusAborted>unknown</StatusAborted>;
  }
  switch (mcpServerStateSeverity(state as never)) {
    case 'ok':
      return <StatusOK>{state}</StatusOK>;
    case 'error':
      return <StatusError>{state}</StatusError>;
    case 'warning':
      return <StatusWarning>{state}</StatusWarning>;
    default:
      return <StatusPending>{state}</StatusPending>;
  }
}

function DefRow({ label, children }: { label: string; children: ReactNode }) {
  const classes = useStyles();
  return (
    <>
      <span className={classes.key}>{label}</span>
      <span>{children}</span>
    </>
  );
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * GitOps provenance recovered from the CR's labels/annotations. Both the Helm
 * (`meta.helm.sh/*`) and Flux HelmRelease (`helm.toolkit.fluxcd.io/*`)
 * conventions are checked so a Flux-deployed muster shows where its MCPServer
 * CRs come from.
 *
 * ponytail: the HelmRelease is shown as a namespace/name identifier, not a
 * deep link -- this plugin has no route to a Flux HelmRelease resource page.
 * Upgrade path: link out to the kubernetes/flux plugin once a stable route ref
 * is available.
 */
function readProvenance(server: MCPServer) {
  const labels = server.getLabels() ?? {};
  const annotations = server.getAnnotations() ?? {};
  return {
    managedBy: labels['app.kubernetes.io/managed-by'],
    helmRelease: annotations['meta.helm.sh/release-name'],
    helmNamespace: annotations['meta.helm.sh/release-namespace'],
    fluxHelmRelease: labels['helm.toolkit.fluxcd.io/name'],
    fluxHelmNamespace: labels['helm.toolkit.fluxcd.io/namespace'],
    fluxKustomization: labels['kustomize.toolkit.fluxcd.io/name'],
  };
}

function AuthChain({ server }: { server: MCPServer }) {
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
        <DefRow label="Token exchange">
          <Box className={classes.grid}>
            {tokenExchange.connectorId && (
              <DefRow label="Connector">{tokenExchange.connectorId}</DefRow>
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
              <DefRow label="Scopes">{tokenExchange.scopes}</DefRow>
            )}
          </Box>
        </DefRow>
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
 * Live runtime state for one server, fetched lazily (only when the row is
 * expanded) from the muster aggregator of the CR's source installation. The
 * query is keyed per installation so several expanded rows of the same muster
 * share one request. Failures (muster unreachable, installation not proxied,
 * auth required) degrade to an inline note rather than breaking the CRD view.
 */
function RuntimeState({ server }: { server: MCPServer }) {
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
        <StateBadge state={runtime.state} />
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
 * via `filter_tools(pattern="<server prefix>_*")`. Each links through to the
 * tool explorer, scoped to the same installation + server prefix.
 */
function ServerTools({ server }: { server: MCPServer }) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const toolExplorerRoute = useRouteRef(toolExplorerRouteRef);
  const installation = server.cluster;
  const prefix = server.getToolNamePrefix();
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
        {data?.truncated ? ' (showing first page)' : ''} —{' '}
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

function Provenance({ server }: { server: MCPServer }) {
  const classes = useStyles();
  const p = readProvenance(server);
  const release = p.helmRelease ?? p.fluxHelmRelease;
  const namespace = p.helmNamespace ?? p.fluxHelmNamespace;

  if (!release && !p.fluxKustomization && !p.managedBy) {
    return (
      <Typography variant="body2" className={classes.note}>
        No GitOps provenance labels found on this CR.
      </Typography>
    );
  }

  return (
    <Box className={classes.grid}>
      {p.managedBy && <DefRow label="Managed by">{p.managedBy}</DefRow>}
      {release && (
        <DefRow label="HelmRelease">
          <span className={classes.mono}>
            {namespace ? `${namespace}/${release}` : release}
          </span>
        </DefRow>
      )}
      {p.fluxKustomization && (
        <DefRow label="Flux kustomization">{p.fluxKustomization}</DefRow>
      )}
    </Box>
  );
}

/**
 * Expanded detail for one MCPServer row: CRD-sourced configuration and the
 * auth/token chain (always available), live runtime state and the per-server
 * tool list (lazy, via the muster MCP proxy), GitOps provenance, and the
 * read-only lifecycle note.
 *
 * ponytail: lifecycle is read-only. MCPServers are Helm/Flux-managed, so the
 * UI exposes no start/stop/restart -- those `core_service_*` tools are mutating
 * and the proxy blocks them unless an installation opts into `allowMutations`.
 * Upgrade path: a guarded lifecycle action gated on that flag.
 */
export function ServerDetailPanel({ server }: { server: MCPServer }) {
  const classes = useStyles();
  const description = server.getDescription();

  return (
    <Box p={2}>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <InfoCard title="Configuration" noPadding={false}>
            <Box className={classes.grid}>
              <DefRow label="Type">{server.getType() ?? '-'}</DefRow>
              <DefRow label="Family">{server.getFamily() ?? '-'}</DefRow>
              <DefRow label="Target MC">
                {server.getManagementCluster() ?? '-'}
              </DefRow>
              <DefRow label="Installation">{server.cluster}</DefRow>
              {server.getUrl() && (
                <DefRow label="URL">
                  <span className={classes.mono}>{server.getUrl()}</span>
                </DefRow>
              )}
              {server.getTimeout() !== undefined && (
                <DefRow label="Timeout">{server.getTimeout()}s</DefRow>
              )}
              <DefRow label="Auto start">
                {server.getAutoStart() ? 'yes' : 'no'}
              </DefRow>
            </Box>
            {description && (
              <Typography
                variant="body2"
                color="textSecondary"
                className={classes.section}
              >
                {description}
              </Typography>
            )}
          </InfoCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <InfoCard title="Authentication / token chain" noPadding={false}>
            <AuthChain server={server} />
          </InfoCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <InfoCard title="Runtime (live)" noPadding={false}>
            <RuntimeState server={server} />
          </InfoCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <InfoCard title="GitOps provenance" noPadding={false}>
            <Provenance server={server} />
            <Typography
              variant="body2"
              className={`${classes.note} ${classes.section}`}
            >
              Lifecycle is managed via GitOps and is read-only here. Start, stop
              and restart are mutating actions blocked unless the installation
              opts into mutations.
            </Typography>
          </InfoCard>
        </Grid>

        <Grid item xs={12}>
          <InfoCard title="Tools" noPadding={false}>
            <ServerTools server={server} />
          </InfoCard>
        </Grid>
      </Grid>
    </Box>
  );
}
