import { makeStyles, Theme } from '@material-ui/core';
import { Box, Flex, Text } from '@backstage/ui';
import { GitOpsManagedLabel } from '@giantswarm/backstage-plugin-ui-react';
import { MCPServer } from '../../lib/k8s';
import {
  DEACTIVATED_SIGN_IN_GATE,
  DisclosureAccordion,
  Gate,
  InstallationHealthPill,
  ServerAuthActions,
} from '../shared';
import {
  familyCoverage,
  selectRepresentative,
  summarizePresence,
} from '../../lib/serverGrouping';
import {
  AuthChain,
  DetailBlock,
  HealthDetails,
  Provenance,
  ServerConfig,
  ServerPrompts,
  ServerResources,
  ServerTools,
  useServerCapabilityCounts,
} from './serverDetail';
import { isGitOpsManaged } from '../../lib/gitops';

const useStyles = makeStyles((theme: Theme) => ({
  summary: {
    flexWrap: 'wrap',
    width: '100%',
  },
  name: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: 600,
  },
  kindLabel: {
    fontSize: 11,
    color: theme.palette.text.secondary,
  },
  pills: {
    marginLeft: 'auto',
    flexWrap: 'wrap',
  },
  // The folded healthy remainder of a long row ("+14 more"): same weight as a
  // pill so the row reads as one list, but no dot -- it is a count, not a
  // cluster.
  more: {
    fontSize: 11,
    color: theme.palette.text.secondary,
    whiteSpace: 'nowrap',
  },
  count: {
    marginLeft: theme.spacing(0.5),
    fontSize: 12,
    color: theme.palette.text.secondary,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  clusterList: {
    flexWrap: 'wrap',
  },
  coverageNote: {
    display: 'block',
    marginTop: theme.spacing(1),
  },
  mcHealthRow: {
    marginBottom: theme.spacing(1.5),
  },
  mcHealthLabel: {
    display: 'block',
    marginBottom: theme.spacing(0.5),
  },
  // The counterpart of ServerMutationActions' bottom action row (standard
  // servers are GitOps-managed, so session auth is their only action). One
  // entry per instance; when every instance renders nothing (the connected
  // majority), `:empty` removes the row so no stray divider is left behind.
  sessionActions: {
    alignItems: 'flex-start',
    marginTop: theme.spacing(2),
    paddingTop: theme.spacing(1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
    '&:empty': {
      display: 'none',
    },
  },
}));

export interface StandardServerDisclosureProps {
  /** The server family this row represents (e.g. `kubernetes`). */
  family: string;
  /** All MCPServer CRs of that family across the active instance's target MCs. */
  servers: MCPServer[];
  /**
   * Every management cluster this installation federates any standard family
   * across. The family's coverage -- and the clusters it is missing from -- is
   * measured against it, so a family still being rolled out reads as "10/24
   * clusters" rather than as a shorter row. Defaults to the family's own
   * clusters (full coverage).
   */
  fleetClusters?: string[];
  /**
   * The active muster installation. Used to prefer this installation's own
   * server as the family's representative rather than an arbitrary peer MC.
   */
  activeInstallation?: string;
  authenticated: boolean;
  defaultExpanded?: boolean;
}

/**
 * One row of the standard-server list: a server family federated across many
 * target management clusters, its canonical tool surface shown once (filtered
 * by `x_<family>_*`), and a health pill per management cluster. The collapsed
 * row keeps to one line -- degraded clusters first, then healthy ones until
 * the row is full, the rest folded into a count -- and the coverage figure
 * says how many of the installation's clusters the family is deployed on.
 * Expanding lists every cluster (degraded first), names the clusters the
 * family is not deployed on, and reveals per-cluster diagnostics, the shared
 * config/auth chain, the tools, and GitOps provenance. Family servers are
 * Flux/Helm-managed, hence read-only here.
 */
export function StandardServerDisclosure({
  family,
  servers,
  fleetClusters,
  activeInstallation,
  authenticated,
  defaultExpanded,
}: StandardServerDisclosureProps) {
  const classes = useStyles();

  const coverage = familyCoverage(
    { family, servers },
    fleetClusters ??
      servers
        .map(s => s.getManagementCluster())
        .filter((mc): mc is string => Boolean(mc)),
  );
  const { present, missing, degraded, fleetSize } = coverage;
  const { shown, folded } = summarizePresence(present);
  const partial = missing.length > 0;
  const clusterWord = present.length === 1 ? 'cluster' : 'clusters';
  const clustersLabel = partial
    ? `${present.length}/${fleetSize} clusters`
    : `${present.length} ${clusterWord}`;

  // Representative instance for shared config/auth/tools: prefer the active
  // installation's own server, then a connected one (never an arbitrary peer MC
  // by list order -- see selectRepresentative / ADR D1).
  const rep = selectRepresentative(servers, activeInstallation);
  const representative = rep?.server ?? servers[0];
  const repMc =
    representative.getManagementCluster() ?? representative.getName();
  const qualified = rep?.qualified ?? false;
  const toolPrefix = `x_${family}`;
  const { resourcesCount, promptsCount } =
    useServerCapabilityCounts(representative);
  const managed = isGitOpsManaged(representative);

  const summary = (
    <Flex align="center" gap="2" className={classes.summary}>
      <code className={classes.name}>{family}</code>
      <span className={classes.kindLabel}>standard server</span>
      <Flex align="center" gap="1" className={classes.pills}>
        {shown.map(p => (
          <InstallationHealthPill
            key={p.mc}
            name={p.mc}
            severity={p.severity}
            state={p.state}
            detail={p.server.getStateExplanation()}
          />
        ))}
        {folded > 0 && <span className={classes.more}>+{folded} more</span>}
        <span
          className={classes.count}
          title={`${servers.length} ${
            servers.length === 1 ? 'instance' : 'instances'
          }`}
        >
          {clustersLabel}
        </span>
      </Flex>
    </Flex>
  );

  let coverageNote = partial
    ? `Deployed on ${present.length} of ${fleetSize} clusters in this installation. Not deployed on: ${missing.join(', ')}.`
    : `Deployed on every cluster this installation federates (${present.length}).`;
  if (degraded.length > 0) {
    coverageNote += ` ${degraded.length} ${
      degraded.length === 1 ? 'cluster is' : 'clusters are'
    } degraded — details below.`;
  }

  return (
    <DisclosureAccordion summary={summary} defaultExpanded={defaultExpanded}>
      {/* Every cluster, not the collapsed row's capped subset -- this is
          where the full per-cluster picture lives now that the dashboard no
          longer repeats it. */}
      <DetailBlock title="Management clusters">
        <Flex align="center" gap="1" className={classes.clusterList}>
          {present.map(p => (
            <InstallationHealthPill
              key={p.mc}
              name={p.mc}
              severity={p.severity}
              state={p.state}
              detail={p.server.getStateExplanation()}
            />
          ))}
        </Flex>
        <Text
          variant="body-small"
          color="secondary"
          className={classes.coverageNote}
        >
          {coverageNote}
        </Text>
      </DetailBlock>

      {degraded.length > 0 && (
        <DetailBlock title="Degraded clusters">
          {degraded.map(p => (
            <Box key={p.mc} className={classes.mcHealthRow}>
              <Text
                variant="body-small"
                weight="bold"
                className={classes.mcHealthLabel}
              >
                {p.mc} · {p.state}
              </Text>
              <HealthDetails server={p.server} />
            </Box>
          ))}
        </DetailBlock>
      )}

      <DetailBlock title="Tools">
        {authenticated ? (
          <ServerTools server={representative} prefixOverride={toolPrefix} />
        ) : (
          <Gate label="This server's tools are read through the muster session, which is not available -- see the notice above." />
        )}
      </DetailBlock>

      <DetailBlock title="Configuration">
        <ServerConfig server={representative} />
        <Text variant="body-small" color="secondary">
          {qualified
            ? `Shared across the fleet; shown for ${repMc}.`
            : `Federated across the fleet; no connected representative on this installation — values shown are from ${repMc} and may differ per cluster.`}
        </Text>
      </DetailBlock>

      <DetailBlock title="Authentication / token chain">
        <AuthChain server={representative} />
        <Text variant="body-small" color="secondary">
          Shown for {repMc}; the auth/token chain differs per cluster (e.g.
          forward-token vs token-exchange/OBO).
        </Text>
      </DetailBlock>

      {authenticated && (resourcesCount ?? 0) > 0 && (
        <DetailBlock title="Resources">
          <ServerResources server={representative} />
        </DetailBlock>
      )}

      {authenticated && (promptsCount ?? 0) > 0 && (
        <DetailBlock title="Prompts">
          <ServerPrompts server={representative} />
        </DetailBlock>
      )}

      <DetailBlock title="GitOps provenance">
        <Provenance server={representative} />
      </DetailBlock>

      {/* The footer these rows close with, matching the integration rows'
          action row: the GitOps claim, then one sign-in affordance per
          instance -- not per family, because `auth://status` and
          `core_auth_login`/`core_auth_logout` are per server, so the
          representative CR's sign-in would leave the family's other instances
          gated with no way to act. ServerAuthActions keeps this quiet for the
          connected majority. The affordances need a muster session: the
          downstream flow is scoped to it, and without one the status read
          behind it would just 401. */}
      {(managed || authenticated) && (
        <Flex direction="column" gap="2" className={classes.sessionActions}>
          {managed && <GitOpsManagedLabel />}
          {authenticated &&
            servers
              // A sigv4 instance has no user sign-in at all; AuthChain above
              // explains the machine identity instead.
              .filter(instance => instance.canAuthenticateInteractively())
              .map(instance => (
                <ServerAuthActions
                  key={instance.getName()}
                  serverName={instance.getName()}
                  installation={instance.cluster}
                  showName
                  oauthConfigured={instance.getAuth()?.type === 'oauth'}
                  signInGate={
                    instance.getSuspended()
                      ? DEACTIVATED_SIGN_IN_GATE
                      : undefined
                  }
                />
              ))}
        </Flex>
      )}
    </DisclosureAccordion>
  );
}
