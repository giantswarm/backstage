import { Box, Typography, makeStyles, Theme, useTheme } from '@material-ui/core';
import {
  MCPServer,
  MCPServerSeverity,
  mcpServerStateSeverity,
  worstSeverity,
} from '../../lib/k8s';
import {
  DisclosureAccordion,
  Gate,
  severityTone,
  toneColors,
} from '../shared';
import {
  AuthChain,
  DetailBlock,
  HealthDetails,
  Provenance,
  ServerConfig,
  ServerTools,
} from './serverDetail';
import { isGitOpsManaged, provenanceReleaseId, readProvenance } from '../../lib/gitops';

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
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    padding: theme.spacing(0.25, 0.75),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    fontSize: 11,
    whiteSpace: 'nowrap',
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  pillName: {
    fontWeight: 500,
    color: theme.palette.text.primary,
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

const UNLABELED = '—';

function InstallationHealthPill({
  name,
  severity,
  state,
}: {
  name: string;
  severity: MCPServerSeverity;
  state: string;
}) {
  const classes = useStyles();
  const theme = useTheme();
  const color = toneColors(theme, severityTone(severity)).main;
  return (
    <span className={classes.pill} title={`${name}: ${state}`}>
      <span className={classes.pillDot} style={{ backgroundColor: color }} />
      <span className={classes.pillName}>{name}</span>
      {severity !== 'ok' && (
        <span style={{ color: toneColors(theme, severityTone(severity)).text }}>
          {state}
        </span>
      )}
    </span>
  );
}

type McPresence = {
  mc: string;
  severity: MCPServerSeverity;
  state: string;
  server: MCPServer;
};

function presenceByMc(servers: MCPServer[]): McPresence[] {
  const byMc = new Map<string, MCPServer[]>();
  for (const s of servers) {
    const mc = s.getManagementCluster() ?? UNLABELED;
    byMc.set(mc, [...(byMc.get(mc) ?? []), s]);
  }
  return [...byMc.entries()]
    .map(([mc, group]) => {
      const severity = group.reduce<MCPServerSeverity>(
        (acc, s) => worstSeverity(acc, mcpServerStateSeverity(s.getState())),
        'ok',
      );
      // Pick the worst-state server as representative for that MC's detail.
      const worst = group.reduce((acc, s) =>
        mcpServerStateSeverity(s.getState()) === severity ? s : acc,
      );
      return {
        mc,
        severity,
        state: worst.getState() ?? 'unknown',
        server: worst,
      };
    })
    .sort((a, b) => a.mc.localeCompare(b.mc));
}

export interface StandardServerDisclosureProps {
  /** The server family this row represents (e.g. `kubernetes`). */
  family: string;
  /** All MCPServer CRs of that family across the active instance's target MCs. */
  servers: MCPServer[];
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
  authenticated,
  defaultExpanded,
}: StandardServerDisclosureProps) {
  const classes = useStyles();
  const presence = presenceByMc(servers);

  // Representative instance for shared config/auth/tools: prefer a healthy one.
  const representative =
    servers.find(s => mcpServerStateSeverity(s.getState()) === 'ok') ??
    servers[0];
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
          Shared across the fleet; shown for {representative.getManagementCluster() ??
            representative.getName()}.
        </Typography>
      </DetailBlock>

      <DetailBlock title="Authentication / token chain">
        <AuthChain server={representative} />
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
