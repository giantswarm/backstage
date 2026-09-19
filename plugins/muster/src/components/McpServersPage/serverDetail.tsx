import { ReactNode } from 'react';
import { makeStyles, Theme } from '@material-ui/core';
import { Box, Flex, Link, Tag, TagGroup, Text } from '@backstage/ui';
import { Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { FactList, type Fact } from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import {
  DEACTIVATED_LABEL,
  MCPServer,
  mcpServerStateSeverity,
} from '../../lib/k8s';
import {
  isGitOpsManaged,
  readProvenance,
  provenanceReleaseId,
} from '../../lib/gitops';
import { decodeDexSubject } from '../../lib/dexSubject';
import {
  formatRelativeTime,
  formatTimestamp,
} from '../../lib/formatRelativeTime';
import { StateBadge } from '../shared';
import { severityTone } from '../shared';
import { toolExplorerRouteRef } from '../../routes';

const useStyles = makeStyles((theme: Theme) => ({
  mono: {
    fontFamily: 'monospace',
    fontSize: 12,
    wordBreak: 'break-all',
  },
  block: {
    marginBottom: theme.spacing(2),
  },
  // bui's Link is underlined by default and takes the body colour. Both rules
  // live in bui's `components` cascade layer, so these unlayered ones win
  // without needing extra specificity.
  link: {
    color: theme.palette.link,
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  // A tool tag is already a pill: the underline only crowds the rows.
  tagLink: {
    textDecoration: 'none',
  },
  capabilityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
    fontSize: 13,
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

/** A note in the secondary voice the detail blocks use for their asides. */
function Note({ children }: { children: ReactNode }) {
  return (
    <Text variant="body-small" color="secondary">
      {children}
    </Text>
  );
}

/** Monospace for an identifier the reader may need to copy or compare. */
function Mono({ children }: { children: ReactNode }) {
  const classes = useStyles();
  return <span className={classes.mono}>{children}</span>;
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
    <Flex direction="column" gap="2" className={classes.block}>
      <Text as="h4" variant="title-x-small" weight="bold">
        {title}
      </Text>
      {children}
    </Flex>
  );
}

/**
 * Where a deactivated server is activated again, as a sentence to append. The
 * lifecycle buttons render for an ad-hoc server only (ServerMutationActions);
 * a GitOps-managed one has no Activate on this page, so pointing at "the
 * actions below" would send the reader to a button that is not there.
 */
function activateHint(server: MCPServer): string {
  return isGitOpsManaged(server) ? '' : ' Use “Activate” in the actions below.';
}

/** CRD-sourced configuration (always available, no muster session needed). */
export function ServerConfig({ server }: { server: MCPServer }) {
  const facts: Fact[] = [];

  // The durable switch behind a `Disconnected` live state. Only added when
  // set: a "Deactivated: no" row on every healthy server would be noise, while
  // on a deactivated one this row is the reason the page exists.
  if (server.getSuspended()) {
    facts.push({
      label: DEACTIVATED_LABEL,
      value: `yes — muster keeps it disconnected until it is activated.${activateHint(
        server,
      )}`,
    });
  }
  facts.push({ label: 'Type', value: server.getType() ?? '-' });
  facts.push({ label: 'Family', value: server.getFamily() ?? '-' });
  if (server.getManagementCluster()) {
    facts.push({ label: 'Target MC', value: server.getManagementCluster() });
  }
  if (server.getUrl()) {
    facts.push({ label: 'URL', value: <Mono>{server.getUrl()}</Mono> });
  }
  if (server.getTimeout() !== undefined) {
    facts.push({ label: 'Timeout', value: `${server.getTimeout()}s` });
  }
  facts.push({
    label: 'Auto start',
    value: server.getAutoStart() ? 'yes' : 'no',
  });
  // `spec.meta`: merged into `params._meta` of every request. Worth its own row
  // rather than a footnote — an AWS-hosted server reads the region it operates
  // in from here, and a wrong value produces confident answers about the wrong
  // account region rather than an error.
  for (const [key, value] of Object.entries(server.getMeta() ?? {})) {
    facts.push({ label: `Meta ${key}`, value: <Mono>{value}</Mono> });
  }

  return <FactList facts={facts} maxWidth={null} />;
}

/**
 * The per-server auth/token chain recovered from `spec.auth`.
 *
 * The sign-in/sign-out affordance deliberately lives in the disclosures'
 * bottom action rows rather than here: this component returns early for a CR
 * without `spec.auth`, while muster can still report that server as
 * `auth_required`, and a federated family renders one AuthChain for an
 * arbitrary representative CR whereas `core_auth_login` is per server
 * instance.
 */
export function AuthChain({ server }: { server: MCPServer }) {
  const auth = server.getAuth();

  if (!auth || auth.type === 'none' || auth.type === undefined) {
    return <Note>No authentication configured (anonymous).</Note>;
  }

  const { tokenExchange, localMint, authorizationServer, sigv4 } = auth;

  const facts: Fact[] = [{ label: 'Type', value: auth.type }];
  if (sigv4) {
    facts.push(
      { label: 'Signing region', value: <Mono>{sigv4.region}</Mono> },
      {
        label: 'Signing service',
        value: sigv4.service ? (
          <Mono>{sigv4.service}</Mono>
        ) : (
          <Note>derived from the URL host</Note>
        ),
      },
      {
        label: 'Assumed role',
        value: sigv4.roleArn ? (
          <Mono>{sigv4.roleArn}</Mono>
        ) : (
          <Note>none — signs as muster's own identity</Note>
        ),
      },
    );
  } else {
    // Meaningless for sigv4 — the CRD rejects the two together, so the row
    // could only ever read "no".
    facts.push({
      label: 'Forward token',
      value: auth.forwardToken ? 'yes' : 'no',
    });
  }
  if (auth.requiredAudiences && auth.requiredAudiences.length > 0) {
    facts.push({
      label: 'Required audiences',
      value: <Mono>{auth.requiredAudiences.join(', ')}</Mono>,
    });
  }
  if (authorizationServer) {
    facts.push({
      label: 'Authorization server',
      value: (
        <>
          <Mono>{authorizationServer.issuer}</Mono>
          {authorizationServer.scopes ? ` (${authorizationServer.scopes})` : ''}
        </>
      ),
    });
  }
  if (tokenExchange?.enabled) {
    if (tokenExchange.connectorId) {
      facts.push({
        label: 'TE connector',
        value: tokenExchange.connectorId,
      });
    }
    if (tokenExchange.dexTokenEndpoint) {
      facts.push({
        label: 'Dex endpoint',
        value: <Mono>{tokenExchange.dexTokenEndpoint}</Mono>,
      });
    }
    if (tokenExchange.expectedIssuer) {
      facts.push({
        label: 'Expected issuer',
        value: <Mono>{tokenExchange.expectedIssuer}</Mono>,
      });
    }
    if (tokenExchange.scopes) {
      facts.push({ label: 'TE scopes', value: tokenExchange.scopes });
    }
  }
  if (localMint?.enabled) {
    facts.push({
      label: 'Local mint',
      value: (
        <>
          audience <Mono>{localMint.audience ?? '-'}</Mono>
        </>
      ),
    });
  }

  return (
    <>
      {/* sigv4 is the one auth type with no user in it at all. Said before the
          fields, because everything below reads like per-user auth otherwise —
          and "who does this act as" is the question an operator is here to
          answer. */}
      {sigv4 && (
        <Note>
          Requests are signed with muster's own AWS machine identity, not the
          calling user's. All users share this identity, and CloudTrail
          attributes their actions to muster. There is no user sign-in.
        </Note>
      )}
      <FactList facts={facts} maxWidth={null} />
    </>
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

  const facts: Fact[] = [];
  if (lastConnected) {
    facts.push({
      label: 'Last connected',
      value: (
        <>
          {formatRelativeTime(lastConnected)}{' '}
          <Note>({formatTimestamp(lastConnected)})</Note>
        </>
      ),
    });
  }
  if (typeof consecutiveFailures === 'number' && consecutiveFailures > 0) {
    facts.push({ label: 'Consecutive failures', value: consecutiveFailures });
  }
  if (nextRetry) {
    facts.push({
      label: 'Next retry',
      value: (
        <>
          {formatRelativeTime(nextRetry)}{' '}
          <Note>({formatTimestamp(nextRetry)})</Note>
        </>
      ),
    });
  }

  return (
    <Box>
      <FactList facts={facts} maxWidth={null} />
      {lastError && (
        <Box mt="2">
          <Text variant="body-x-small" color="secondary">
            Last error
          </Text>
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
      <Note>Live runtime state unavailable: {(error as Error).message}</Note>
    );
  }

  const runtime = (data?.mcpServers ?? []).find(s => s.name === name);
  if (!runtime) {
    return <Note>Server not present in the aggregator's runtime list.</Note>;
  }

  // The session rows describe this user's session, not the server: on a
  // deactivated server they can still read "connected / 58 tools" from a
  // sign-in the reconciler has since undone, which next to `Disconnected`
  // looks like a working server with an empty Tools block. Said once, above
  // the list, and naming the rows it means -- "the rows below" would take in
  // Live state and Status, which are about the server.
  const sessionRows =
    runtime.sessionStatus !== undefined ||
    runtime.sessionAuth !== undefined ||
    runtime.toolsCount !== undefined ||
    runtime.resourcesCount !== undefined ||
    runtime.promptsCount !== undefined;
  const staleSessionNote = server.getSuspended() && sessionRows;

  const facts: Fact[] = [
    {
      label: 'Live state',
      value: runtime.state ? (
        <StateBadge
          tone={severityTone(mcpServerStateSeverity(runtime.state as never))}
          label={runtime.state}
        />
      ) : (
        '-'
      ),
    },
  ];
  if (runtime.statusMessage) {
    facts.push({ label: 'Status', value: runtime.statusMessage });
  }
  if (runtime.sessionStatus) {
    facts.push({ label: 'Session', value: runtime.sessionStatus });
  }
  if (runtime.sessionAuth) {
    facts.push({ label: 'Session auth', value: runtime.sessionAuth });
  }
  if (runtime.toolsCount !== undefined) {
    facts.push({ label: 'Tools (session)', value: runtime.toolsCount });
  }
  if (runtime.resourcesCount !== undefined) {
    facts.push({ label: 'Resources (session)', value: runtime.resourcesCount });
  }
  if (runtime.promptsCount !== undefined) {
    facts.push({ label: 'Prompts (session)', value: runtime.promptsCount });
  }
  if (runtime.registeredBy) {
    facts.push({
      label: 'Registered by',
      value: (
        <span title={runtime.registeredBy}>
          {runtime.registeredByEmail ??
            decodeDexSubject(runtime.registeredBy) ??
            runtime.registeredBy}
        </span>
      ),
    });
  }
  if (runtime.consecutiveFailures) {
    facts.push({
      label: 'Consecutive failures',
      value: runtime.consecutiveFailures,
    });
  }
  if (runtime.nextRetryAfter) {
    facts.push({
      label: 'Next retry',
      value: formatTimestamp(runtime.nextRetryAfter),
    });
  }
  if (runtime.connectedAt) {
    facts.push({
      label: 'Connected at',
      value: formatTimestamp(runtime.connectedAt),
    });
  }
  if (runtime.error) {
    facts.push({ label: 'Error', value: <Mono>{runtime.error}</Mono> });
  }

  return (
    <Box>
      {staleSessionNote && (
        <Text variant="body-x-small" color="secondary">
          {DEACTIVATED_LABEL} — the Session, Tools, Resources and Prompts rows
          are your session's last connection to this server, not a working
          server.
        </Text>
      )}
      <FactList facts={facts} maxWidth={null} />
    </Box>
  );
}

/**
 * Why a server's tool list is empty, most deliberate cause first.
 *
 * Deactivated wins over everything: muster keeps the server disconnected on
 * purpose, so neither "down" nor "sign in" is the remedy. `Auth Required` is a
 * session state, not a degraded one (ADR D3): the server exposes no tools
 * because this user's session lacks the audience, not because it "may be
 * down" -- and only where a sign-in exists to point at: a sigv4 server signs
 * as muster itself, so "sign in" would be advice nobody can act on.
 */
function noToolsExplanation(server: MCPServer): string {
  if (server.getSuspended()) {
    return `No tools exposed — this server is deactivated.${activateHint(
      server,
    )}`;
  }
  const authGated =
    server.getState() === 'Auth Required' &&
    server.canAuthenticateInteractively();
  return authGated
    ? 'No tools exposed — your muster session is not authenticated to this server. Use “Sign in” in the actions below.'
    : 'No tools exposed (the server may be down or unreachable).';
}

/**
 * Tools this server contributes to the aggregated catalogue, discovered lazily
 * via `filter_tools(pattern="<prefix>_*")`. Each tag links to the tool
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
    return <Note>Tools unavailable: {(error as Error).message}</Note>;
  }

  const tools = data?.tools ?? [];
  if (tools.length === 0) {
    return <Note>{noToolsExplanation(server)}</Note>;
  }

  return (
    <Flex direction="column" gap="3">
      <Note>
        {data?.total ?? tools.length} tool(s) under <Mono>{pattern}</Mono>
        {data?.truncated ? ' (first page)' : ''} —{' '}
        <Link className={classes.link} href={explorerLink()}>
          Open in tool explorer
        </Link>
      </Note>
      <TagGroup aria-label={`Tools under ${pattern}`}>
        {tools.map(tool => (
          <Tag
            key={tool.name}
            id={tool.name}
            size="small"
            textValue={tool.name}
          >
            {/* The link is the Tag's child rather than its `href`: react-aria
                renders an `href`-carrying Tag as a pressable grid row, not an
                anchor, which would cost the tool list middle-click and
                open-in-new-tab. The title carries the summary on hover. */}
            <Link
              className={classes.tagLink}
              href={explorerLink(tool.name)}
              title={tool.summary ?? tool.description ?? tool.name}
            >
              {tool.name.startsWith(`${prefix}_`)
                ? tool.name.slice(prefix.length + 1)
                : tool.name}
            </Link>
          </Tag>
        ))}
      </TagGroup>
    </Flex>
  );
}

/**
 * Per-session capability counts for one server, read from the same
 * `core_mcpserver_list` query RuntimeState uses (react-query dedupes it, so
 * this costs no extra request).
 *
 * Callers use it to decide whether a Resources or Prompts section is worth
 * rendering at all: most servers expose neither, and an always-present empty
 * block reads as broken rather than as informative. A count is absent rather
 * than `0` when the server exposes none, and absent on aggregators older than
 * muster#1099 -- in both cases the section is simply not shown.
 */
export function useServerCapabilityCounts(server: MCPServer): {
  resourcesCount?: number;
  promptsCount?: number;
} {
  const musterApi = useApi(musterApiRef);
  const installation = server.cluster;
  const name = server.getName();

  const { data } = useQuery({
    queryKey: ['muster', 'servers', installation],
    queryFn: () => musterApi.listServers(installation),
  });

  const runtime = (data?.mcpServers ?? []).find(s => s.name === name);
  return {
    resourcesCount: runtime?.resourcesCount,
    promptsCount: runtime?.promptsCount,
  };
}

/**
 * Resources this server contributes to the aggregated catalogue.
 *
 * Unlike tools, resources cannot be discovered by name prefix: a resource URI
 * carrying a scheme is exposed by the aggregator unchanged, so `x_<server>_*`
 * has nothing to match and two servers may advertise the same URI. muster
 * scopes them by source server instead (muster#1096), which is what
 * `filter_resources` takes here.
 */
export function ServerResources({ server }: { server: MCPServer }) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const installation = server.cluster;
  const name = server.getName();

  const { data, isLoading, error } = useQuery({
    queryKey: ['muster', 'server-resources', installation, name],
    queryFn: () =>
      musterApi.filterResources({ installation, server: name, limit: 200 }),
  });

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return <Note>Resources unavailable: {(error as Error).message}</Note>;
  }

  const resources = data?.resources ?? [];
  if (resources.length === 0) {
    return (
      <Note>
        No resources exposed (server may be down or require authentication).
      </Note>
    );
  }

  return (
    <Box>
      <Note>
        {data?.total ?? resources.length} resource(s)
        {data?.truncated ? ' (first page)' : ''}
      </Note>
      <Box className={classes.capabilityList}>
        {resources.map(resource => (
          <Box key={`${resource.server}:${resource.uri}`}>
            <Mono>{resource.uri}</Mono>
            {resource.name ? ` — ${resource.name}` : ''}
            {resource.description && (
              <Text as="p" variant="body-x-small" color="secondary">
                {resource.description}
              </Text>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/**
 * Prompts this server contributes. Prompt names *are* prefixed
 * `x_<server>_<name>`, so these could be filtered by pattern like tools --
 * the server filter is used for symmetry with resources and to stay correct
 * if the prefix scheme ever changes.
 */
export function ServerPrompts({ server }: { server: MCPServer }) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const installation = server.cluster;
  const name = server.getName();

  const { data, isLoading, error } = useQuery({
    queryKey: ['muster', 'server-prompts', installation, name],
    queryFn: () =>
      musterApi.filterPrompts({ installation, server: name, limit: 200 }),
  });

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return <Note>Prompts unavailable: {(error as Error).message}</Note>;
  }

  const prompts = data?.prompts ?? [];
  if (prompts.length === 0) {
    return (
      <Note>
        No prompts exposed (server may be down or require authentication).
      </Note>
    );
  }

  // Prompts are never family-grouped, so this is not getToolNamePrefix().
  const prefix = server.getPromptNamePrefix();

  return (
    <Box>
      <Note>
        {data?.total ?? prompts.length} prompt(s)
        {data?.truncated ? ' (first page)' : ''}
      </Note>
      <Box className={classes.capabilityList}>
        {prompts.map(prompt => (
          <Box key={prompt.name}>
            <Mono>
              {prompt.name.startsWith(`${prefix}_`)
                ? prompt.name.slice(prefix.length + 1)
                : prompt.name}
            </Mono>
            {prompt.description && (
              <Text as="p" variant="body-x-small" color="secondary">
                {prompt.description}
              </Text>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** GitOps provenance, with the managing HelmRelease/Kustomization surfaced. */
export function Provenance({ server }: { server: MCPServer }) {
  const p = readProvenance(server);
  const releaseId = provenanceReleaseId(p);

  if (!releaseId && !p.managedBy) {
    return (
      <Note>
        No GitOps provenance labels found -- this looks like an ad-hoc server.
      </Note>
    );
  }

  const facts: Fact[] = [];
  if (p.managedBy) {
    facts.push({ label: 'Managed by', value: p.managedBy });
  }
  if (p.helmRelease ?? p.fluxHelmRelease) {
    facts.push({ label: 'HelmRelease', value: <Mono>{releaseId}</Mono> });
  }
  if (p.fluxKustomization) {
    facts.push({
      label: 'Flux kustomization',
      value: <Mono>{p.fluxKustomization}</Mono>,
    });
  }

  return <FactList facts={facts} maxWidth={null} />;
}
