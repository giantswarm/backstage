import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Progress } from '@backstage/core-components';
import { Alert, Flex, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';
import { agentDetailRouteRef } from '../../routes';
import { useSessionUsage } from '../../hooks/useSessionUsage';
import { useTokenRates } from '../../hooks/useTokenRates';
import { useUsageInstallation } from '../../hooks/useUsageInstallation';
import { useKagentCapabilitiesMap } from '../../hooks/useKagentCapabilities';
import { useAgents } from '../AgentsDataProvider';
import { InstallationScopeNote } from '../InstallationGroups';
import { NotReachableInstallationsNote } from '../NotReachableInstallationsNote';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';
import { ByAgentTable } from './ByAgentTable';
import { CoverageNote } from './CoverageNote';
import { TokensPerDayCard } from './TokensPerDayCard';
import { TopCallsTable } from './TopCallsTable';
import { TotalsStrip } from './TotalsStrip';
import {
  couldNotTell,
  fillMissingDays,
  hasAnyUsage,
  toByAgentRows,
} from './helpers';

const useStyles = makeStyles((theme: Theme) => ({
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(3),
  },
}));

/**
 * Shown only until a response arrives, or when one could not be read at all —
 * the real window travels in the response (`windowDays`).
 */
const FALLBACK_WINDOW_DAYS = 30;

/** Copy that has to stop claiming ownership on an unsecure-mode installation. */
const PERSONAL_COPY = {
  title: 'Your sessions',
  description: (days: number, installation: string) =>
    `Your own agent sessions on ${installation} over the last ${days} days, derived from kagent's stored conversations — including sessions you started from Slack. The Overview and Cost tabs cover every user's model calls; these are yours.`,
  descriptionWithoutInstallation: (days: number) =>
    `Your own agent sessions over the last ${days} days, derived from kagent's stored conversations — including sessions you started from Slack. The Overview and Cost tabs cover every user's model calls; these are yours.`,
  topTools: 'Your top tools',
  topServers: 'Your top MCP servers',
  empty: (days: number, installation: string) =>
    `You have no agent sessions on ${installation} in the last ${days} days.`,
  unreadable: (installation: string) =>
    `None of your sessions on ${installation} could be read, so there is nothing to total yet.`,
};

const SHARED_COPY = {
  title: 'Agent sessions',
  description: (days: number, installation: string) =>
    `Every user's agent sessions on ${installation} over the last ${days} days, derived from kagent's stored conversations.`,
  descriptionWithoutInstallation: (days: number) =>
    `Agent sessions over the last ${days} days, derived from kagent's stored conversations.`,
  topTools: 'Top tools',
  topServers: 'Top MCP servers',
  empty: (days: number, installation: string) =>
    `There are no agent sessions on ${installation} in the last ${days} days.`,
  unreadable: (installation: string) =>
    `No sessions on ${installation} could be read, so there is nothing to total yet.`,
};

/**
 * The "Your sessions" view of the Usage tab, and every state it can be in.
 *
 * Its session-level counts are the ones no gateway metric can give — kagent is
 * the only thing that knows what a session or a turn is — and its costs are the
 * ones no gateway metric can give *exactly*, because those metrics carry no
 * session label. So the estimated cost here is this installation's observed
 * $/token applied to kagent's token counts, and every place it appears says so.
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

  // Probe capabilities only once an installation has resolved. The singular
  // `useKagentCapabilities('')` would *not* skip: its reachability gate asks
  // `isNotReachable('')`, which is false for an empty string, so it fired
  // `GET /kagent/me` with no `installation` parameter — a guaranteed 400,
  // cached under the key `[…,'me','']`, on every mount before the installation
  // settled. An empty list runs no queries and still answers "unknown".
  const capabilityInstallations = useMemo(
    () => (installation ? [installation] : []),
    [installation],
  );
  const capabilitiesFor = useKagentCapabilitiesMap(capabilityInstallations);
  const { isUserScoped } = capabilitiesFor(installation ?? '');

  // No `enabled` gate on reachability: `useUsageInstallation` only ever resolves
  // `installation` out of `candidates`, which is built from the *reachable* set,
  // so an unreachable installation can never be the one being read. The hook's
  // own `Boolean(installation)` is the whole gate. (There used to be a
  // `notReachable.includes(installation)` check here; the two sets are disjoint
  // by construction, so it was dead and the state it guarded fell through to a
  // wrong claim — see the branch for it below.)
  const { usage, isLoading, isError, isNotDeployed } =
    useSessionUsage(installation);

  const { rows: agentRows } = useAgents();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);

  // The $/token this installation actually achieved, from the gateway metrics.
  // Two queries, and they resolve independently of the session usage above —
  // so an installation without Mimir shows every count it always showed and an
  // em dash where the cost would be, rather than losing the section.
  //
  // `isRateLoading` is threaded down so the cost cells can hold a skeleton
  // while it settles. The counts arrive from kagent well before these two
  // queries land, so without it the section rendered complete except for an em
  // dash in the cost column — which reads as "no rate for this" rather than
  // "not yet", and those are the two states this page works hardest to keep
  // apart everywhere else.
  const {
    rates,
    window: rateWindow,
    isLoading: isRateLoading,
    tier: rateTier,
  } = useTokenRates(installation);
  // Only `installation` is a rate this table can claim was applied. Every
  // other tier here means no cost cell has a figure, and the note below has to
  // stop describing one.
  const hasRate = rateTier === 'installation';

  // Strictly `false`. `undefined` means the probe has not resolved, or kagent
  // reported no subject at all — which is reachable on a healthy deployment —
  // and treating either as "shared" would show a working installation a claim
  // it has not earned.
  const isPersonal = isUserScoped !== false;
  const copy = isPersonal ? PERSONAL_COPY : SHARED_COPY;

  // `||`, not `??`: `normalizeSessionUsage` coerces an unparseable
  // `windowDays` to `0` and `emptyUsage()` sets `0` explicitly, so `??` never
  // fired and a body this parser could not fully read rendered "over the last
  // 0 days" — and made `fillMissingDays` short-circuit. `0` is not a value the
  // backend can mean: the reader floors it at 1.
  const windowDays = usage?.windowDays || FALLBACK_WINDOW_DAYS;
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
      // `h3`, under the page's own `h2`. Without that level this heading was the
      // page's, and "Your agent usage" then read as scoping the MCP section
      // below it too — which is every caller's, not the reader's.
      as="h3"
      variant="title-x-small"
      title={copy.title}
      // A description is required, and before an installation resolves there is
      // none to name — so the generic form stands in rather than the component
      // taking an optional it does not want. The window is stated *here* rather
      // than in the page heading, because it is configurable and arrives in the
      // response — only a section that has read one can name it truthfully.
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
    notReachable.length > 0
  ) {
    // Everything in scope that runs kagent is unreachable from this portal, so
    // nothing was tried and `installation` never resolved. Gated on the
    // *unreachable set* rather than on `notReachable.includes(installation)`,
    // which could never be true: `candidates` comes from the reachable set and
    // `notReachable` from its complement, so the two are disjoint and
    // `installation` is only ever drawn from the former. That dead check used
    // to leave this case falling through to "you have no agent sessions on  in
    // the last 30 days" — a factual negative about the account, with an empty
    // installation name, when nothing had been asked.
    body = <NotReachableInstallationsNote installations={notReachable} />;
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
  } else if (usage && !hasAnyUsage(usage) && couldNotTell(usage)) {
    // Nothing readable, but not nothing: the route answers 200 with zeroed
    // totals and a populated `unreadable`/`skipped` when reads fail or the cap
    // bites, so "you have no sessions in the last 30 days" would state a
    // factual negative the response itself contradicts. `CoverageNote` carries
    // the counts, and used to be unreachable here because it only rendered in
    // the full-body branch below.
    body = (
      <>
        <Text variant="body-medium" color="secondary">
          {copy.unreadable(installation ?? '')}
        </Text>
        <CoverageNote usage={usage} isPersonal={isPersonal} />
      </>
    );
  } else if (!hasAnyUsage(usage)) {
    // Genuinely nothing in the window. Not a strip of zeros beside two empty
    // charts, which reads as broken.
    body = (
      <Text variant="body-medium" color="secondary">
        {copy.empty(windowDays, installation ?? '')}
      </Text>
    );
  } else if (usage) {
    body = (
      <>
        <TotalsStrip
          totals={usage.totals}
          rates={rates}
          isRateLoading={isRateLoading}
        />
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
          rates={rates}
          rateWindow={rateWindow}
          installation={installation}
          isRateLoading={isRateLoading}
          hasRate={hasRate}
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
              // `null` means the call resolved to no aggregated downstream
              // server. NOT "not through muster": muster's own core tools
              // (`filter_tools`, `describe_tool`) land here too, and real data
              // showed 44 such calls mislabelled as bypassing the thing they
              // went through. The wire leaves the wording to us.
              name: entry.server ?? 'No downstream server',
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
