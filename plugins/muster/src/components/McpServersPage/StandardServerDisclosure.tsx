import { Box, Typography, makeStyles, Theme } from '@material-ui/core';
import { MCPServer } from '../../lib/k8s';
import { DisclosureAccordion, Gate, InstallationHealthPill } from '../shared';
import { presenceByMc, selectRepresentative } from '../../lib/serverGrouping';
import {
  AuthChain,
  DetailBlock,
  HealthDetails,
  Provenance,
  ServerConfig,
  ServerTools,
} from './serverDetail';
import {
  isGitOpsManaged,
  provenanceReleaseId,
  readProvenance,
} from '../../lib/gitops';

const useStyles = makeStyles((theme: Theme) => ({
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1, 1.5),
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
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(0.75),
  },
  count: {
    marginLeft: theme.spacing(0.5),
    fontSize: 12,
    color: theme.palette.text.secondary,
    fontVariantNumeric: 'tabular-nums',
  },
  managedNote: {
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(1),
  },
  mcHealthRow: {
    marginBottom: theme.spacing(1.5),
  },
  mcHealthLabel: {
    fontWeight: 600,
    fontSize: 13,
    marginBottom: theme.spacing(0.5),
  },
}));

export interface StandardServerDisclosureProps {
  /** The server family this row represents (e.g. `kubernetes`). */
  family: string;
  /** All MCPServer CRs of that family across the active instance's target MCs. */
  servers: MCPServer[];
  /**
   * The active muster installation. Used to prefer this installation's own
   * server as the family's representative rather than an arbitrary peer MC.
   */
  activeInstallation?: string;
  authenticated: boolean;
  defaultExpanded?: boolean;
}

/**
 * One row of the standard-server health matrix: a server family federated
 * across many target management clusters, its canonical tool surface shown once
 * (filtered by `x_<family>_*`), and a health pill per management cluster.
 * Expanding reveals the shared config/auth chain, the tools, GitOps provenance,
 * and per-cluster diagnostics for any degraded cell. Standard servers are
 * Flux/Helm-managed, hence read-only here.
 */
export function StandardServerDisclosure({
  family,
  servers,
  activeInstallation,
  authenticated,
  defaultExpanded,
}: StandardServerDisclosureProps) {
  const classes = useStyles();
  const presence = presenceByMc(servers);

  // Representative instance for shared config/auth/tools: prefer the active
  // installation's own server, then a connected one (never an arbitrary peer MC
  // by list order -- see selectRepresentative / ADR D1).
  const rep = selectRepresentative(servers, activeInstallation);
  const representative = rep?.server ?? servers[0];
  const repMc =
    representative.getManagementCluster() ?? representative.getName();
  const qualified = rep?.qualified ?? false;
  const toolPrefix = `x_${family}`;
  const managed = isGitOpsManaged(representative);
  const releaseId = provenanceReleaseId(readProvenance(representative));

  const failing = presence.filter(p => p.severity !== 'ok');

  const summary = (
    <Box className={classes.summary}>
      <code className={classes.name}>{family}</code>
      <span className={classes.kindLabel}>standard server</span>
      <Box className={classes.pills}>
        {presence.map(p => (
          <InstallationHealthPill
            key={p.mc}
            name={p.mc}
            severity={p.severity}
            state={p.state}
          />
        ))}
        <span className={classes.count}>{servers.length} instances</span>
      </Box>
    </Box>
  );

  return (
    <DisclosureAccordion summary={summary} defaultExpanded={defaultExpanded}>
      <DetailBlock title="Tools">
        {authenticated ? (
          <ServerTools server={representative} prefixOverride={toolPrefix} />
        ) : (
          <Gate label="Authenticate to muster to inspect this server's tools." />
        )}
      </DetailBlock>

      <DetailBlock title="Configuration">
        <ServerConfig server={representative} />
        <Typography variant="caption" color="textSecondary">
          {qualified
            ? `Shared across the fleet; shown for ${repMc}.`
            : `Federated across the fleet; no connected representative on this installation — values shown are from ${repMc} and may differ per cluster.`}
        </Typography>
      </DetailBlock>

      <DetailBlock title="Authentication / token chain">
        <AuthChain server={representative} />
        <Typography variant="caption" color="textSecondary">
          Shown for {repMc}; the auth/token chain differs per cluster (e.g.
          forward-token vs token-exchange/OBO).
        </Typography>
      </DetailBlock>

      <DetailBlock title="GitOps provenance">
        <Provenance server={representative} />
        {managed && (
          <Typography variant="body2" className={classes.managedNote}>
            Lifecycle is managed via GitOps and read-only here
            {releaseId ? ` (HelmRelease ${releaseId})` : ''}. Edit the manifest
            in the management-clusters repo and open a PR.
          </Typography>
        )}
      </DetailBlock>

      {failing.length > 0 && (
        <DetailBlock title="Degraded clusters">
          {failing.map(p => (
            <Box key={p.mc} className={classes.mcHealthRow}>
              <Typography className={classes.mcHealthLabel}>
                {p.mc} · {p.state}
              </Typography>
              <HealthDetails server={p.server} />
            </Box>
          ))}
        </DetailBlock>
      )}
    </DisclosureAccordion>
  );
}
