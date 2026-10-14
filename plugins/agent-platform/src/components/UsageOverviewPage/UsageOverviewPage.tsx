import { useMemo } from 'react';
import { Flex, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { usageCostRouteRef } from '../../routes';
import { useLlmUsageView } from '../../hooks/useLlmUsageView';
import { useSessionUsage } from '../../hooks/useSessionUsage';
import { useUsageWindow } from '../../hooks/useUsageWindow';
import { useCurrency } from '../../lib/formatNumbers';
import {
  CALLS_SERIES,
  type LlmDailySeries,
  type LlmUsage,
} from '../../lib/llmUsage';
import {
  ActivityHeatmap,
  ActivityHeatmapUnavailable,
  DataStartNote,
  LlmUsageState,
  ReliabilityStrip,
  SessionKpiTiles,
  TokensByTypeCard,
  TopAgentsCard,
  UsageCard,
  UsageKpiTiles,
  type HeatmapDay,
  type TopAgentsRow,
  type UsageKpiSessions,
} from '../LlmUsage';
import { UsageColumn } from '../UsageColumn';
import { sessionCountForWindow } from '../AgentUsageSection/helpers';

const useStyles = makeStyles((theme: Theme) => ({
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(2),
  },
}));

/** How many agents the Overview ranks before "and N more". */
const TOP_AGENTS_SHOWN = 4;

const HEATMAP_TITLE = 'Model calls per day';

/** The daily-calls series as the heatmap's days, oldest first. */
function heatmapDays(daily: LlmDailySeries): HeatmapDay[] {
  return daily.rows.map(row => {
    const value = row[CALLS_SERIES];
    return { day: row.day, value: typeof value === 'number' ? value : 0 };
  });
}

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
 * the headline trends:
 *
 * 1. the KPI tiles — the spend teaser, tokens and model calls, the reader's
 *    own sessions, active agents;
 * 2. model calls per day as an activity heatmap, beside the busiest agents;
 * 3. the gateway's health;
 * 4. the token-type trend, always shown like the other cards. It used to sit
 *    in a collapsed fold-out to keep the view to one desktop viewport (T52);
 *    the product owner asked for it always visible, so the view now scrolls.
 *
 * Connector tool calls (the muster-contributed section) are not here: they
 * have their own Connectors view, because "how are my connectors doing" is a
 * question of its own.
 *
 * **One home per metric** (`design-context/implementation/usage-metrics-ia.md`):
 * money lives on the Cost tab, so this view carries exactly one spend number —
 * the teaser tile, which points there — and ranks agents by model calls, not
 * by spend. The reader's own slice lives on Your sessions; the session-count
 * tile is its teaser.
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
 * The corollary — that an agent calling a provider directly bypasses the
 * listener and so appears nowhere here — is deliberately **not** in the
 * heading. It is a real limitation, documented in `docs/agent-platform.md`
 * under "What it cannot show", but on the platform's own installations every
 * agent goes through the gateway, so leading with it cast doubt on figures
 * that are in fact complete. The empty state still says it, which is the one
 * place a reader needs it.
 */
export function UsageOverviewPage() {
  const classes = useStyles();
  const { days } = useUsageWindow();
  // No `comparePrevious`: the change against the previous window is a money
  // trend, and it lives on the Cost tab with the extra query it costs. The
  // daily calls feed the heatmap, which only this view draws.
  const view = useLlmUsageView({ days, dailyCalls: true });
  const costRoute = useRouteRef(usageCostRouteRef);
  const { usage, installation, isResolvedFromAll } = view;
  const currency = useCurrency(installation);

  // The reader's own session count, shared (same query key) with the Your
  // sessions tab — so after either view loads, the other costs nothing. It
  // follows the selected window, cut from the backend's daily buckets as Your
  // sessions cuts it; a wider selection than kagent keeps names kagent's.
  const sessionUsage = useSessionUsage(installation);
  const hasSessionUsage =
    !sessionUsage.isNotDeployed &&
    !sessionUsage.isError &&
    !!sessionUsage.usage;
  const sessionWindow = sessionUsage.usage
    ? sessionCountForWindow(sessionUsage.usage, days)
    : undefined;
  const sessions: UsageKpiSessions | undefined =
    sessionUsage.isNotDeployed || sessionUsage.isError
      ? undefined
      : {
          count: sessionWindow?.count,
          windowDays: sessionWindow?.days || undefined,
          isLoading: sessionUsage.isLoading,
        };

  const agentRows = useMemo(() => (usage ? topAgentRows(usage) : []), [usage]);
  const callDays = useMemo(
    () => (usage?.callsPerDay ? heatmapDays(usage.callsPerDay) : undefined),
    [usage],
  );

  // Today's bar is real use so far — queried over elapsed-time-since-midnight
  // rather than extrapolated to a whole day.
  const windowNote = `The last ${days} days.`;

  return (
    <UsageColumn>
      {/* gap 4, not the 6 the other views use: the view is dense, and
          keeps as much as it can in the first desktop viewport. */}
      <Flex direction="column" gap="4">
        {/* One short caption, not a heading: the tab above already names
            the view, and the screen's title is the page's h1. The
            resolved-from-all hint shares its line, to keep it short. */}
        <Text as="p" variant="body-medium" color="secondary">
          {installation ? (
            <>
              Shows everyone's model use on <strong>{installation}</strong> over
              the last {days} days.
              {isResolvedFromAll &&
                ' It shows one environment at a time; switch it in the Environment control.'}
            </>
          ) : (
            `Shows everyone's model use over the last ${days} days.`
          )}
        </Text>

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
              gen_ai metrics, which this environment does not publish where this
              portal can query them.
            </Text>
          </>
        )}

        {view.state === 'ready' && usage && (
          <>
            <DataStartNote usage={usage} />
            <UsageKpiTiles
              usage={usage}
              currency={currency}
              windowDays={days}
              sessions={sessions}
              costHref={costRoute?.()}
            />

            {/* The headline trend beside who drives it. */}
            <div className={classes.row}>
              {usage.callsPerDay === null ? (
                <ActivityHeatmapUnavailable title={HEATMAP_TITLE} />
              ) : (
                callDays && (
                  <ActivityHeatmap
                    title={HEATMAP_TITLE}
                    days={callDays}
                    partialLast
                    note="Every user's calls through the gateway, by UTC day; today's so far."
                  />
                )
              )}
              <TopAgentsCard
                title="Top agents"
                rows={agentRows}
                limit={TOP_AGENTS_SHOWN}
                emptyMessage="The gateway attributed no calls to an agent in this window."
                note="Shows the share of every user's model calls. Cost ranks agents by spend."
              />
            </div>

            {/* Each figure explains its own arithmetic in its hint. */}
            <UsageCard title="Gateway health" wide>
              <ReliabilityStrip
                reliability={usage.reliability}
                windowDays={usage.windowDays}
              />
            </UsageCard>

            <TokensByTypeCard daily={usage.tokensPerDay} note={windowNote} />
          </>
        )}
      </Flex>
    </UsageColumn>
  );
}
