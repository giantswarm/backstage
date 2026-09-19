import { makeStyles, Theme } from '@material-ui/core';
import { Flex, Text } from '@backstage/ui';
import {
  DEACTIVATED_LABEL,
  MCPServer,
  mcpServerStateSeverity,
} from '../../lib/k8s';
import { DisclosureAccordion, Gate, StateBadge, severityTone } from '../shared';
import {
  AuthChain,
  DetailBlock,
  HealthDetails,
  Provenance,
  RuntimeState,
  ServerConfig,
  ServerPrompts,
  ServerResources,
  ServerTools,
  useServerCapabilityCounts,
} from './serverDetail';
import { ServerMutationActions } from './ServerMutationActions';

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
  endpoint: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: theme.palette.text.secondary,
    wordBreak: 'break-all',
  },
  right: {
    marginLeft: 'auto',
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
  const { resourcesCount, promptsCount } = useServerCapabilityCounts(server);
  const state = server.getState() ?? 'unknown';
  const severity = mcpServerStateSeverity(server.getState());
  const healthy = severity === 'ok';

  const summary = (
    <Flex align="center" gap="2" className={classes.summary}>
      <code className={classes.name}>{server.getName()}</code>
      {server.getUrl() && (
        <code className={classes.endpoint}>{server.getUrl()}</code>
      )}
      <Flex align="center" gap="2" className={classes.right}>
        {/* The durable switch ahead of the transient state: a deactivated
            server is `Disconnected` by design, and the live state alone reads
            as an outage with the Activate button as its only explanation. */}
        {server.getSuspended() && (
          <StateBadge tone="neutral" label={DEACTIVATED_LABEL} />
        )}
        <StateBadge tone={severityTone(severity)} label={state} />
      </Flex>
    </Flex>
  );

  return (
    <DisclosureAccordion summary={summary} defaultExpanded={defaultExpanded}>
      <DetailBlock title="Configuration">
        <ServerConfig server={server} />
        {server.getDescription() && (
          <Text variant="body-small" color="secondary">
            {server.getDescription()}
          </Text>
        )}
      </DetailBlock>

      <DetailBlock title="Authentication / token chain">
        <AuthChain server={server} />
      </DetailBlock>

      <DetailBlock title="Runtime (live)">
        {authenticated ? (
          <RuntimeState server={server} />
        ) : (
          <Gate label="Live runtime state is read through the muster session, which is not available -- see the notice above." />
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
          <Gate label="This server's tools are read through the muster session, which is not available -- see the notice above." />
        )}
      </DetailBlock>

      {authenticated && (resourcesCount ?? 0) > 0 && (
        <DetailBlock title="Resources">
          <ServerResources server={server} />
        </DetailBlock>
      )}

      {authenticated && (promptsCount ?? 0) > 0 && (
        <DetailBlock title="Prompts">
          <ServerPrompts server={server} />
        </DetailBlock>
      )}

      <DetailBlock title="GitOps provenance">
        <Provenance server={server} />
      </DetailBlock>

      {/* Also carries the per-session Sign in / Sign out (the sign-in used to
          live under "Authentication / token chain", where an action was easy
          to miss among the read-only detail). */}
      <ServerMutationActions server={server} authenticated={authenticated} />
    </DisclosureAccordion>
  );
}
