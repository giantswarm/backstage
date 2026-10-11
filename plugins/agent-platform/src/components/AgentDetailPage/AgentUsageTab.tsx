import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Flex, Text } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { LoadingIndicator } from '@giantswarm/backstage-plugin-ui-react';

import { useLlmUsage } from '../../hooks/useLlmUsage';
import { useSessionUsage } from '../../hooks/useSessionUsage';
import {
  formatCount,
  formatMoney,
  formatTokens,
  formatUsd,
  useCurrency,
} from '../../lib/formatNumbers';
import { usageCostRouteRef } from '../../routes';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { KpiTile, KpiTileGrid } from '../LlmUsage';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { toAgentIdentifier } from '../SessionsDataProvider/helpers';

/** The window this tab reads: the prototype's "this month". */
const WINDOW_DAYS = 30;

export type AgentUsageTabProps = {
  installation: string;
  namespace: string;
  name: string;
};

function AgentUsageContent({
  installation,
  namespace,
  name,
}: AgentUsageTabProps) {
  const currency = useCurrency(installation);
  const costRoute = useRouteRef(usageCostRouteRef);

  // Everyone's model calls through the gateway, reduced to this agent's row —
  // the same query (and cache entry) the Usage screen's 30-day view reads.
  const gateway = useLlmUsage(installation, { days: WINDOW_DAYS });
  const gatewayRow = useMemo(
    () =>
      gateway.usage?.byAgent.find(
        row =>
          row.kind !== 'unattributed' &&
          row.namespace === namespace &&
          row.agent === name,
      ),
    [gateway.usage, namespace, name],
  );

  // The reader's own sessions with the agent, from kagent — which lists only
  // the caller's, so these tiles say "your".
  const sessionUsage = useSessionUsage(installation);
  const agentId = toAgentIdentifier(namespace, name);
  const sessionRow = sessionUsage.usage?.byAgent.find(
    entry => entry.agentId === agentId,
  );
  const sessionWindow = sessionUsage.usage?.windowDays || WINDOW_DAYS;

  if (gateway.isLoading || sessionUsage.isLoading) {
    return <LoadingIndicator label="Reading this agent's usage…" />;
  }

  const hasGateway =
    gateway.isAvailable !== false && !gateway.isError && Boolean(gateway.usage);
  const hasSessions =
    !sessionUsage.isNotDeployed &&
    !sessionUsage.isError &&
    !!sessionUsage.usage;
  const costHref = costRoute?.();

  return (
    <Flex direction="column" gap="4">
      <Text as="p" variant="body-medium" color="secondary">
        This agent over the last {WINDOW_DAYS} days on {installation}.
      </Text>

      <KpiTileGrid>
        {hasGateway && (
          <>
            <KpiTile
              label="Est. cost"
              hint="Shows the gateway's price for every user's calls to this agent's model. Models missing from its catalogue add nothing."
              // No row is no calls, which is zero spend; a row without a
              // cost is a model the catalogue cannot price, which is "—".
              value={
                gatewayRow
                  ? formatMoney(gatewayRow.costUsd, currency)
                  : formatMoney(0, currency)
              }
              sub="every user"
            />
            <KpiTile
              label="Tokens"
              hint="Counts the tokens this agent's model calls used, as the gateway counted them."
              value={formatTokens(gatewayRow?.tokens ?? 0)}
              sub="every user"
            />
            <KpiTile
              label="Model calls"
              hint="Counts how often this agent called its model."
              value={formatCount(gatewayRow?.calls ?? 0)}
              sub="every user"
            />
          </>
        )}
        {hasSessions && (
          <KpiTile
            label="Your sessions"
            hint={`Counts the sessions you started with this agent in the last ${sessionWindow} days. Other users' sessions cannot be counted here.`}
            value={formatCount(sessionRow?.sessions ?? 0)}
            sub={`yours, last ${sessionWindow} days`}
          />
        )}
        {/* Only when a runtime reported one: "not reported" is not "$0.00". */}
        {sessionRow?.reportedCostUsd !== undefined && (
          <KpiTile
            label="Reported cost"
            hint="Shows what the agent's runtime reported for your turns. Only some runtimes report a cost."
            value={formatUsd(sessionRow.reportedCostUsd)}
            sub="from the agent's runtime, your sessions"
          />
        )}
      </KpiTileGrid>

      {!hasGateway && (
        <Text as="p" variant="body-small" color="secondary">
          {gateway.isAvailable === false
            ? `Cost and token figures for every user need the gateway's metrics, which ${installation} does not publish to a store this portal can read.`
            : 'Cost and token figures for every user could not be read right now.'}
        </Text>
      )}
      {!hasSessions && (
        <Text as="p" variant="body-small" color="secondary">
          Your sessions with this agent could not be counted here.
        </Text>
      )}

      {costHref && <Link to={costHref}>Open in Usage</Link>}
    </Flex>
  );
}

/**
 * This agent's slice of the Usage screen: what its model calls cost and how
 * many it made (everyone's, from the gateway), and your own sessions with it
 * (from kagent). The figures are the Usage screen's own reductions, read for
 * this agent's environment — nothing is computed here that the Cost view does
 * not show in its by-agent table.
 *
 * The providers are the Usage screen's: the gateway reduction names agents
 * through the fleet's agent list. Mounted here, inside the tab, so the
 * agent page pays for them only when someone opens it.
 */
export function AgentUsageTab(props: AgentUsageTabProps) {
  return (
    <ModelConfigsProvider>
      <AgentsDataProvider>
        <AgentUsageContent {...props} />
      </AgentsDataProvider>
    </ModelConfigsProvider>
  );
}
