import { Box, Typography, makeStyles, Theme } from '@material-ui/core';
import { MCPServer, mcpServerStateSeverity } from '../../lib/k8s';
import { DisclosureAccordion, Gate, StateBadge, severityTone } from '../shared';
import {
  AuthChain,
  DetailBlock,
  HealthDetails,
  Provenance,
  RuntimeState,
  ServerConfig,
  ServerTools,
} from './serverDetail';
import { ServerMutationActions } from './ServerMutationActions';

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
  endpoint: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: theme.palette.text.secondary,
    wordBreak: 'break-all',
  },
  right: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
}));

export interface IntegrationServerDisclosureProps {
  server: MCPServer;
  authenticated: boolean;
  defaultExpanded?: boolean;
}

/**
 * A singular integration server (outside the per-management-cluster fleet
 * structure): endpoint in the summary, full per-server detail when expanded --
 * config, auth/token chain, live runtime, tools, GitOps provenance -- plus the
 * gitops-aware CRUD actions.
 */
export function IntegrationServerDisclosure({
  server,
  authenticated,
  defaultExpanded,
}: IntegrationServerDisclosureProps) {
  const classes = useStyles();
  const state = server.getState() ?? 'unknown';
  const severity = mcpServerStateSeverity(server.getState());
  const healthy = severity === 'ok';

  const summary = (
    <Box className={classes.summary}>
      <code className={classes.name}>{server.getName()}</code>
      {server.getUrl() && (
        <code className={classes.endpoint}>{server.getUrl()}</code>
      )}
      <Box className={classes.right}>
        <StateBadge tone={severityTone(severity)} label={state} />
      </Box>
    </Box>
  );

  return (
    <DisclosureAccordion summary={summary} defaultExpanded={defaultExpanded}>
      <DetailBlock title="Configuration">
        <ServerConfig server={server} />
        {server.getDescription() && (
          <Typography variant="body2" color="textSecondary">
            {server.getDescription()}
          </Typography>
        )}
      </DetailBlock>

      <DetailBlock title="Authentication / token chain">
        <AuthChain server={server} />
      </DetailBlock>

      <DetailBlock title="Runtime (live)">
        {authenticated ? (
          <RuntimeState server={server} />
        ) : (
          <Gate label="Authenticate to muster to see live runtime state." />
        )}
      </DetailBlock>

      {!healthy && (
        <DetailBlock title="Diagnostics">
          <HealthDetails server={server} />
        </DetailBlock>
      )}

      <DetailBlock title="Tools">
        {authenticated ? (
          <ServerTools server={server} />
        ) : (
          <Gate label="Authenticate to muster to inspect this server's tools." />
        )}
      </DetailBlock>

      <DetailBlock title="GitOps provenance">
        <Provenance server={server} />
      </DetailBlock>

      <ServerMutationActions server={server} />
    </DisclosureAccordion>
  );
}
