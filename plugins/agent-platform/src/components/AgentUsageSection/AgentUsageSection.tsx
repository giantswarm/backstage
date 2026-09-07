import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Progress } from '@backstage/core-components';
import { Alert, Flex, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';
import { agentDetailRouteRef } from '../../routes';
import { useSessionUsage } from '../../hooks/useSessionUsage';
import { useUsageInstallation } from '../../hooks/useUsageInstallation';
import { useKagentCapabilities } from '../../hooks/useKagentCapabilities';
import { useAgents } from '../AgentsDataProvider';
import { InstallationScopeNote } from '../InstallationGroups';
import { NotReachableInstallationsNote } from '../NotReachableInstallationsNote';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';
import { ByAgentTable } from './ByAgentTable';
import { CoverageNote } from './CoverageNote';
import { TokensPerDayCard } from './TokensPerDayCard';
import { TopCallsTable } from './TopCallsTable';
import { TotalsStrip } from './TotalsStrip';
import { fillMissingDays, hasAnyUsage, toByAgentRows } from './helpers';

const useStyles = makeStyles((theme: Theme) => ({
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(3),
  },
}));

/** Copy that has to stop claiming ownership on an unsecure-mode installation. */
const PERSONAL_COPY = {
  title: 'Your agent usage',
  description: (days: number, installation: string) =>
    `Your own agent sessions on ${installation} over the last ${days} days, derived from kagent's stored conversations — including sessions you started from Slack.`,
  descriptionWithoutInstallation: (days: number) =>
    `Your own agent sessions over the last ${days} days, derived from kagent's stored conversations — including sessions you started from Slack.`,
  topTools: 'Your top tools',
  topServers: 'Your top MCP servers',
  empty: (days: number, installation: string) =>
    `You have no agent sessions on ${installation} in the last ${days} days.`,
};

const SHARED_COPY = {
  title: 'Agent usage',
  description: (days: number, installation: string) =>
    `Agent sessions on ${installation} over the last ${days} days, derived from kagent's stored conversations.`,
  descriptionWithoutInstallation: (days: number) =>
    `Agent sessions over the last ${days} days, derived from kagent's stored conversations.`,
  topTools: 'Top tools',
  topServers: 'Top MCP servers',
  empty: (days: number, installation: string) =>
    `There are no agent sessions on ${installation} in the last ${days} days.`,
};

/**
 * The personal half of the Usage tab, and every state it can be in.
 *
 * The one state worth reading carefully is `unsecure` mode: kagent there
 * resolves every caller to a shared built-in user, so its session list is
 * everyone's. The copy *switches* rather than adding a warning under a heading
 * that still says "your" — promising ownership at the top and retracting it
 * below is the failure the sessions list already avoids this way.
 */
export function AgentUsageSection() {
  const classes = useStyles();
  const {
    installation,
    candidates,
    isResolvedFromAll,
    notReachable,
    isLoading: isResolving,
    hasInstallations,
  } = useUsageInstallation();

  const notReachableHere =
    installation !== undefined && notReachable.includes(installation);
  const { isUserScoped } = useKagentCapabilities(installation ?? '');
  const { usage, isLoading, isError, isNotDeployed } = useSessionUsage(
    installation,
    { enabled: !notReachableHere },
  );

  const { rows: agentRows } = useAgents();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);

  // Strictly `false`. `undefined` means the probe has not resolved, or kagent
  // reported no subject at all — which is reachable on a healthy deployment —
  // and treating either as "shared" would show a working installation a claim
  // it has not earned.
  const isPersonal = isUserScoped !== false;
  const copy = isPersonal ? PERSONAL_COPY : SHARED_COPY;

  const windowDays = usage?.windowDays ?? 30;
  const daily = useMemo(
    () => fillMissingDays(usage?.daily ?? [], windowDays),
    [usage?.daily, windowDays],
  );
  const byAgentRows = useMemo(
    () =>
      toByAgentRows(
        usage?.byAgent ?? [],
        installation,
        agentRows,
        row =>
          agentDetailRoute?.({
            installation: row.installation,
            namespace: row.namespace,
            name: row.technicalName,
          }),
        'Unattributed',
      ),
    [usage?.byAgent, installation, agentRows, agentDetailRoute],
  );

  const header = (
    <SectionHeader
      title={copy.title}
      // A description is required, and before an installation resolves there is
      // none to name — so the generic form stands in rather than the component
      // taking an optional it does not want.
      description={
        installation
          ? copy.description(windowDays, installation)
          : copy.descriptionWithoutInstallation(windowDays)
      }
    />
  );

  let body;
  if (!isResolving && !hasInstallations) {
    body = (
      <Text variant="body-medium" color="secondary">
        This portal knows no installations, so there is no usage to read.
      </Text>
    );
  } else if (
    !isResolving &&
    candidates.length === 0 &&
    notReachable.length === 0
  ) {
    // Under a pinned scope `InstallationScopeNote` names the installation and
    // says kagent is not on it; under "all" there is no one installation to
    // name, so say it plainly.
    body = (
      <>
        <InstallationScopeNote component="kagent" />
        <Text variant="body-medium" color="secondary">
          None of the installations this portal knows run kagent.
        </Text>
      </>
    );
  } else if (notReachableHere) {
    // Nothing was tried on the user's behalf, so there is nothing to retry.
    body = <NotReachableInstallationsNote installations={[installation!]} />;
  } else if (isResolving || isLoading) {
    body = <Progress aria-label="Loading usage" />;
  } else if (isNotDeployed) {
    body = (
      <>
        <InstallationScopeNote component="kagent" />
        <Text variant="body-medium" color="secondary">
          kagent is not installed on {installation}.
        </Text>
      </>
    );
  } else if (isError) {
    body = (
      <UnreachableInstallationsAlert
        installations={installation ? [installation] : []}
        resourceName="usage"
      />
    );
  } else if (!hasAnyUsage(usage)) {
    // Not a strip of zeros beside two empty charts, which reads as broken.
    body = (
      <Text variant="body-medium" color="secondary">
        {copy.empty(windowDays, installation ?? '')}
      </Text>
    );
  } else if (usage) {
    body = (
      <>
        <TotalsStrip totals={usage.totals} />
        <div className={classes.row}>
          <TokensPerDayCard
            title="Input tokens per day"
            data={daily}
            dataKey="inputTokens"
            variant="input"
          />
          <TokensPerDayCard
            title="Output tokens per day"
            data={daily}
            dataKey="outputTokens"
            variant="output"
          />
        </div>
        <ByAgentTable
          rows={byAgentRows}
          emptyMessage="kagent recorded no agent for these sessions."
        />
        <div className={classes.row}>
          <TopCallsTable
            title={copy.topTools}
            nameLabel="Tool"
            rows={usage.topTools.map(entry => ({
              id: entry.tool,
              name: entry.tool,
              calls: entry.calls,
            }))}
            emptyMessage="No tool calls in this window."
          />
          <TopCallsTable
            title={copy.topServers}
            nameLabel="MCP server"
            rows={usage.topMcpServers.map((entry, position) => ({
              id: entry.server ?? `direct-${position}`,
              // `null` means the tool is not muster-proxied, so there is no
              // server to name. The wire deliberately leaves the wording here.
              name: entry.server ?? 'Not through muster',
              calls: entry.calls,
            }))}
            emptyMessage="No tool calls in this window."
          />
        </div>
        <CoverageNote usage={usage} isPersonal={isPersonal} />
      </>
    );
  }

  return (
    <Flex direction="column" gap="4">
      {header}
      {isResolvedFromAll && installation && (
        <Text variant="body-small" color="secondary">
          Showing {installation}. Usage is read one installation at a time — pin
          another in the header to switch.
        </Text>
      )}
      {isUserScoped === false && (
        <Alert
          status="warning"
          title="These numbers are not scoped to you"
          description={`kagent on ${installation} is not configured to identify individual users, so this covers everyone's sessions on that installation, not only yours.`}
        />
      )}
      {body}
    </Flex>
  );
}
