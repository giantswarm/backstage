import { ReactNode, useMemo } from 'react';
import { Flex, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { usageCostRouteRef } from '../../routes';
import { useLlmUsageView } from '../../hooks/useLlmUsageView';
import { useSessionUsage } from '../../hooks/useSessionUsage';
import { useUsageWindow } from '../../hooks/useUsageWindow';
import { useCurrency } from '../../lib/formatNumbers';
import type { LlmUsage } from '../../lib/llmUsage';
import {
  LlmUsageState,
  ReliabilityStrip,
  SessionKpiTiles,
  TokensByTypeCard,
  TopAgentsCard,
  UsageCard,
  UsageKpiTiles,
  type TopAgentsRow,
  type UsageKpiSessions,
} from '../LlmUsage';
import { ShellAwareContent } from '../ShellAwareContent';
import { UsageColumn } from '../UsageColumn';

const useStyles = makeStyles((theme: Theme) => ({
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(3),
  },
}));

/**
 * Shown only until the kagent response arrives — the real window travels in
 * the response (`windowDays`), the same stance as `AgentUsageSection`.
 */
const FALLBACK_SESSION_WINDOW_DAYS = 30;

/**
 * The by-agent breakdown as the compact card's rows, busiest first — ranked by
 * model calls, because the Overview answers "how much is the platform used";
 * the spend ranking is the Cost tab's.
 */
function topAgentRows(usage: LlmUsage): TopAgentsRow[] {
  const totalCalls = usage.totals.calls;
  return [...usage.byAgent]
    .sort((a, b) => b.calls - a.calls)
    .map(row => ({
      id: row.id,
      label: row.label,
      href: row.href,
      calls: row.calls,
      sharePct: totalCalls > 0 ? (row.calls / totalCalls) * 100 : undefined,
    }));
}

/**
 * The Usage screen's at-a-glance view: is the platform healthy, and what are
 * the headline trends. The KPI tiles — the spend teaser, tokens and model
 * calls, the reader's own sessions, active agents — then tokens per day by
 * type, the busiest agents, the gateway's health and, when the muster plugin
 * contributed one, the connector tool-call section.
 *
 * **One home per metric** (`design-context/implementation/usage-metrics-ia.md`):
 * money lives on the Cost tab, so this view carries exactly one spend number —
 * the teaser tile, which points there — and ranks agents by model calls, not
 * by spend. The reader's own slice lives on Your sessions; the session-count
 * tile is its teaser. The figures that used to sit on a separate Technical
 * details tab answer this view's question (health, trends) and live here now.
 *
 * **Everyone's traffic, not the reader's — except the one tile that says
 * otherwise.** The gateway figures come from the agentgateway LLM listener,
 * which sees every call regardless of who started it. The session count is
 * kagent's, which can only answer for the caller, so its tile is labelled
 * "Your sessions" and links the reader to that tab.
 *
 * **Without the gateway metrics** (`mimirEnabled: false` — a standalone
 * installation with no observability stack this portal can query) the page
 * shows what kagent alone can answer: the reader's own session-derived tiles
 * (`SessionKpiTiles`), under a note saying the fleet-wide figures need those
 * metrics. kagent's answer is real data about the reader's own work, and an
 * Overview that renders one paragraph while the Your sessions tab is full of
 * numbers read as broken. Nothing is invented, and no cost: the reader's own
 * cost is Your sessions' to show.
 *
 * The muster section arrives through the `sections` extension input, so muster
 * needs no knowledge of this layout: the contract is still the node id
 * `sub-page:agent-platform/usage` and the input name `sections`, exactly as
 * `mcpUsageSection` in the muster plugin declares it.
 *
 * The corollary — that an agent calling a provider directly bypasses the
 * listener and so appears nowhere here — is deliberately **not** in the
 * heading. It is a real limitation, documented in `docs/agent-platform.md`
 * under "What it cannot show", but on the platform's own installations every
 * agent goes through the gateway, so leading with it cast doubt on figures
 * that are in fact complete. The empty state still says it, which is the one
 * place a reader needs it.
 */
export function UsageOverviewPage({ sections }: { sections?: ReactNode[] }) {
  const classes = useStyles();
  const { days } = useUsageWindow();
  // No `comparePrevious`: the change against the previous window is a money
  // trend, and it lives on the Cost tab with the extra query it costs.
  const view = useLlmUsageView({ days });
  const costRoute = useRouteRef(usageCostRouteRef);
  const { usage, installation, isResolvedFromAll } = view;
  const currency = useCurrency(installation);
  const hasSections = (sections?.length ?? 0) > 0;

  // The reader's own session count, shared (same query key) with the Your
  // sessions tab — so after either view loads, the other costs nothing. Its
  // window is the backend's own, which the tile names when it has one.
  const sessionUsage = useSessionUsage(installation);
  const hasSessionUsage =
    !sessionUsage.isNotDeployed &&
    !sessionUsage.isError &&
    !!sessionUsage.usage;
  const sessions: UsageKpiSessions | undefined =
    sessionUsage.isNotDeployed || sessionUsage.isError
      ? undefined
      : {
          count: sessionUsage.usage?.totals.sessions,
          windowDays: sessionUsage.usage?.windowDays || undefined,
          isLoading: sessionUsage.isLoading,
        };

  const agentRows = useMemo(() => (usage ? topAgentRows(usage) : []), [usage]);

  // Today's bar is real use so far — queried over elapsed-time-since-midnight
  // rather than extrapolated to a whole day.
  const windowNote = `The last ${days} days.`;

  return (
    <ShellAwareContent>
      <UsageColumn>
        <Flex direction="column" gap="6">
          {/* One short caption, not a heading: the tab above already names
              the view, and the screen's title is the page's h1. */}
          <Text as="p" variant="body-medium" color="secondary">
            {installation ? (
              <>
                Everyone's model use on <strong>{installation}</strong> over the
                last {days} days.
              </>
            ) : (
              `Everyone's model use over the last ${days} days.`
            )}
          </Text>

          {isResolvedFromAll && installation && (
            <Text variant="body-small" color="secondary">
              Showing {installation}. Metrics are read one environment at a time
              — pick another in the Environment control to switch.
            </Text>
          )}

          <LlmUsageState view={view} />

          {/* The gateway metrics are configured away, but kagent answered —
              so show what it answered instead of leaving the paragraph above
              as the whole page. `LlmUsageState` already said why the
              fleet-wide figures are missing; this adds the figures that are
              not. */}
          {view.state === 'unavailable' && hasSessionUsage && (
            <>
              <SessionKpiTiles
                usage={sessionUsage.usage!}
                windowDays={
                  sessionUsage.usage!.windowDays || FALLBACK_SESSION_WINDOW_DAYS
                }
              />
              <Text variant="body-small" color="secondary">
                These figures come from kagent and cover your own sessions only.
                Fleet-wide tokens, spend and gateway health need the gateway's
                gen_ai metrics, which this environment does not publish to a
                metrics store this portal can query.
              </Text>
            </>
          )}

          {view.state === 'ready' && usage && (
            <>
              <UsageKpiTiles
                usage={usage}
                currency={currency}
                windowDays={days}
                sessions={sessions}
                costHref={costRoute?.()}
              />

              <div className={classes.row}>
                <TokensByTypeCard
                  daily={usage.tokensPerDay}
                  note={windowNote}
                />
              </div>

              <div className={classes.row}>
                <TopAgentsCard
                  title="Top agents"
                  rows={agentRows}
                  emptyMessage="The gateway attributed no calls to an agent in this window."
                  note="Each bar is the agent's share of the window's model calls, across every user. The Cost tab ranks them by spend."
                />
              </div>

              <UsageCard
                title="Gateway health"
                wide
                // Each figure explains its own arithmetic in its hint, so the
                // note carries only what none of them says: these are the model
                // calls, not the turns that made them.
                note="All of these describe the model calls themselves — not the agent turns around them, which spend most of their time in tool calls."
              >
                <ReliabilityStrip reliability={usage.reliability} />
              </UsageCard>
            </>
          )}

          {/* The muster-contributed connector tool-call section renders below
              the gateway figures whatever state those are in: its data source
              (muster's own Prometheus metrics) is independent of Mimir's
              gen_ai series, so one being absent says nothing about the other. */}
          {hasSections && <>{sections}</>}
        </Flex>
      </UsageColumn>
    </ShellAwareContent>
  );
}
