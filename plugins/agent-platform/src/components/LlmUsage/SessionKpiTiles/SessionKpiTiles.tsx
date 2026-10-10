import type { SessionUsageResponse } from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  formatCount,
  formatTokens,
  formatUsd,
} from '../../../lib/formatNumbers';
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
 * totals, the runtime-reported cost where any turn reported one, and the
 * agents those sessions used.
 *
 * Every figure here is the reader's own (kagent lists only the caller's
 * sessions), which each tile says — where the gateway tiles these stand in
 * for are everyone's. No estimated cost: the estimate's $/token rate comes
 * from the very gateway metrics that are absent here, and inventing a rate
 * would put a made-up number on the page's biggest tile. The reported cost is
 * real, but partial — only some runtimes report one — and its tile shows only
 * when at least one turn did, because "not reported" is not "$0.00".
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
      {totals.reportedCostUsd !== undefined && (
        <KpiTile
          label="Reported cost"
          hint="What the agents' runtimes themselves reported for your turns, summed. Only some runtimes report a cost, so this usually covers a subset of the turns — it is real, not estimated, and never a fleet total."
          value={formatUsd(totals.reportedCostUsd)}
          sub="reported by the runtimes, for your sessions"
        />
      )}
      <KpiTile
        label="Your agents"
        hint={`Distinct agents kagent recorded for your sessions over ${windowNote}. Agents other users ran do not appear — counting them needs the gateway metrics.`}
        value={formatCount(agents)}
        sub="agents your sessions used"
      />
    </KpiTileGrid>
  );
}
