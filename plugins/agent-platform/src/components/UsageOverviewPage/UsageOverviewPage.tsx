import { useMemo } from 'react';
import { Content } from '@backstage/core-components';
import { Flex, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { usageCostRouteRef } from '../../routes';
import { useLlmUsageView } from '../../hooks/useLlmUsageView';
import { useSessionUsage } from '../../hooks/useSessionUsage';
import { useUsageWindow } from '../../hooks/useUsageWindow';
import { useCurrency } from '../../lib/formatNumbers';
import type { LlmUsage } from '../../lib/llmUsage';
import {
  LlmUsageState,
  PricingCoverageAlert,
  SessionKpiTiles,
  TopSpendCard,
  UsageKpiTiles,
  type TopSpendRow,
  type UsageKpiSessions,
} from '../LlmUsage';
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

/** The by-agent breakdown as the compact card's rows, biggest spender first. */
function topAgentRows(usage: LlmUsage): TopSpendRow[] {
  return [...usage.byAgent]
    .sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0))
    .map(row => ({
      id: row.id,
      label: row.label,
      href: row.href,
      costUsd: row.costUsd,
      sharePct: row.sharePct,
    }));
}

/** The by-model breakdown as the compact card's rows, biggest spender first. */
function topModelRows(usage: LlmUsage): TopSpendRow[] {
  return [...usage.byModel]
    .sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0))
    .map(row => ({
      id: row.id,
      label: row.model,
      costUsd: row.costUsd,
      sharePct: row.sharePct,
    }));
}

/**
 * The Usage screen's at-a-glance view, per the prototype: the KPI tiles —
 * spend this window against the previous one, tokens, the reader's own
 * sessions, active agents — and the compact per-agent and per-model spend
 * breakdowns. The full tables and the cost-over-time chart live one tab away
 * on Cost; the raw token counts and gateway health on Technical details.
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
 * (`SessionKpiTiles`), under a note saying the fleet-wide token and cost
 * figures need those metrics. kagent's answer is real data about the reader's
 * own work, and an Overview that renders one paragraph while the Your
 * sessions tab is full of numbers read as broken. Nothing is invented: no
 * estimated cost (its $/token rate would come from the absent metrics), and
 * the reported cost shows only when a runtime reported one.
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
  // `comparePrevious` is the one extra query the delta on the spend tile
  // needs; only this view pays for it.
  const view = useLlmUsageView({ days, comparePrevious: true });
  const costRoute = useRouteRef(usageCostRouteRef);
  const { usage, installation, isResolvedFromAll } = view;
  const currency = useCurrency(installation);

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
  const modelRows = useMemo(() => (usage ? topModelRows(usage) : []), [usage]);

  return (
    <Content>
      <UsageColumn>
        <Flex direction="column" gap="6">
          <SectionHeader
            as="h2"
            variant="title-medium"
            title="Overview"
            description={
              installation ? (
                <>
                  Every user's model calls on <strong>{installation}</strong>{' '}
                  over the last {days} days, as seen by the agentgateway LLM
                  listener.
                </>
              ) : (
                `Model usage across the platform, as seen by the agentgateway LLM listener.`
              )
            }
          />

          {isResolvedFromAll && installation && (
            <Text variant="body-small" color="secondary">
              Showing {installation}. Metrics are read one installation at a
              time — pick another in the Environment control to switch.
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
                Fleet-wide spend, token and per-model figures need the gateway's
                gen_ai metrics, which this installation does not publish to a
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
              />

              {/* Compact here, with the detail table one tab away: the reader
                  of this page needs to know the cost figures are incomplete,
                  not which models to add to the catalogue. */}
              <PricingCoverageAlert
                rows={usage.unpricedModels}
                costHref={costRoute?.()}
              />

              <div className={classes.row}>
                <TopSpendCard
                  title="Top agents"
                  rows={agentRows}
                  currency={currency}
                  emptyMessage="The gateway attributed no calls to an agent in this window."
                  note="Each bar is the agent's share of the window's priced spend, across every user. The Cost tab has the full table."
                />
                <TopSpendCard
                  title="By model"
                  rows={modelRows}
                  currency={currency}
                  emptyMessage="No model answered a call in this window."
                  note="The model that answered each call, as the gateway recorded it. The Cost tab has tokens, calls and rates per model."
                />
              </div>

              <Text variant="body-small" color="secondary">
                Tokens, model calls and gateway health are under Technical
                details.
              </Text>
            </>
          )}
        </Flex>
      </UsageColumn>
    </Content>
  );
}
