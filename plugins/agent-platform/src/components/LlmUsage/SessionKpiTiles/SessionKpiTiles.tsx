import type { SessionUsageResponse } from '@giantswarm/backstage-plugin-agent-platform-common';
import { formatCount, formatTokens } from '../../../lib/formatNumbers';
import { KpiTile, KpiTileGrid } from '../KpiTile';

export type SessionKpiTilesProps = {
  /** The kagent fan-out's answer for the resolved installation. */
  usage: SessionUsageResponse;
  /** The window the figures cover: the response's own, floored by the caller. */
  windowDays: number;
};

/**
 * The Overview's KPI row for an installation **without gateway metrics**:
 * what kagent alone can answer — the reader's own sessions, their token
 * totals, and the agents those sessions used. A headline teaser of the Your
 * sessions tab, which carries the full breakdown.
 *
 * Every figure here is the reader's own (kagent lists only the caller's
 * sessions), which each tile says — where the gateway tiles these stand in
 * for are everyone's.
 *
 * **No cost.** Money has one home per scope (see
 * `design-context/implementation/usage-metrics-ia.md`): everyone's spend on the
 * Cost tab, the reader's own on Your sessions. There is no gateway spend to
 * tease here, and the runtime-reported cost is the reader's own, so it stays
 * on Your sessions (and on the Cost tab's gateway-less state) rather than
 * adding a second cost figure to the Overview.
 */
export function SessionKpiTiles({ usage, windowDays }: SessionKpiTilesProps) {
  const { totals } = usage;
  const agents = usage.byAgent.filter(entry => entry.agentId !== null).length;
  const windowNote = `the last ${windowDays} days`;

  return (
    <KpiTileGrid>
      <KpiTile
        label="Your sessions"
        hint={`Sessions you started with at least one turn over ${windowNote}, from kagent's stored conversations. Other users' sessions are not countable from here.`}
        value={formatCount(totals.sessions)}
        sub="yours — see Your sessions for the breakdown"
      />
      <KpiTile
        label="Your tokens"
        hint={`kagent's reported token total for your turns over ${windowNote}. It can exceed input + output — a model billing thinking tokens counts them in the total and in neither part.`}
        value={formatTokens(totals.totalTokens)}
        sub={`across ${formatCount(totals.turns)} turns`}
      />
      <KpiTile
        label="Your agents"
        hint={`Distinct agents kagent recorded for your sessions over ${windowNote}. Agents other users ran do not appear — counting them needs the gateway metrics.`}
        value={formatCount(agents)}
        sub="agents your sessions used"
      />
    </KpiTileGrid>
  );
}
