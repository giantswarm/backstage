import { Flex, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import { useLlmUsageView } from '../../hooks/useLlmUsageView';
import { useSessionUsage } from '../../hooks/useSessionUsage';
import { useUsageWindow } from '../../hooks/useUsageWindow';
import {
  formatUsd,
  isConvertedCurrency,
  useCurrency,
} from '../../lib/formatNumbers';
import {
  CostKpiTiles,
  CostPerDayCard,
  KpiTile,
  LlmByAgentTable,
  LlmByModelTable,
  LlmUsageState,
  PricingCoverageAlert,
  PricingCoverageNote,
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
 * Where the money went: the window's spend against the previous one, the
 * blended rate and the cache-read share behind it, spend over time, and the
 * full breakdowns by agent and by model.
 *
 * **The one home for money** (`design-context/implementation/usage-metrics-ia.md`):
 * every $ breakdown on the Usage screen is here. The Overview carries the spend
 * total only as a teaser tile pointing here; the reader's own session cost is
 * Your sessions', a different scope (kagent, the caller only) the gateway
 * cannot answer per session.
 *
 * The two breakdowns and the Overview's tiles are reductions of the same two
 * Mimir answers, so they cannot disagree — and because both views run the same
 * queries through react-query's cache, switching between them costs nothing.
 *
 * Both tables are also the **table view** the charts require: several hues in
 * the categorical palette sit below 3:1 against the card surface, so the exact
 * figures have to be readable somewhere that does not depend on telling two
 * fills apart.
 *
 * **Without the gateway metrics** the page keeps the honest one-paragraph
 * state (`LlmUsageState`), compact in the content column — but when the
 * reader's own runtimes reported a cost through kagent, that figure shows
 * beneath it: it is the one cost this installation *can* answer, and it is
 * measured, not estimated. Never a fleet total, and the tile says so.
 */
export function UsageCostPage() {
  const classes = useStyles();
  const { days } = useUsageWindow();
  // `comparePrevious` is the one extra query the delta on the spend tile
  // needs; only this view pays for it.
  const view = useLlmUsageView({ days, comparePrevious: true });
  const { usage, installation } = view;
  const currency = useCurrency(installation);
  const converted = isConvertedCurrency(currency);

  // Only read for the gateway-less fallback below; the query key is shared
  // with the Overview and the Your sessions tab, so this costs no extra round.
  const sessionUsage = useSessionUsage(installation);
  const reportedCostUsd =
    !sessionUsage.isNotDeployed && !sessionUsage.isError
      ? sessionUsage.usage?.totals.reportedCostUsd
      : undefined;
  const sessionWindowDays = sessionUsage.usage?.windowDays || 30;

  // Today's bar is real spend so far — queried over elapsed-time-since-midnight
  // rather than extrapolated to a whole day — and that it therefore sits below
  // a full day needs no saying: a reader looking at a partial day already
  // knows what time it is.
  const windowNote = `The last ${days} days.`;

  return (
    <ShellAwareContent>
      <UsageColumn>
        <Flex direction="column" gap="6">
          {/* One short caption, not a heading: the tab above already names
              the view. How the spend is priced is the footnote's to say. */}
          <Text as="p" variant="body-medium" color="secondary">
            {installation ? (
              <>
                Spend on <strong>{installation}</strong> over the last {days}{' '}
                days, for every user.
              </>
            ) : (
              `Spend over the last ${days} days, for every user.`
            )}
          </Text>

          <LlmUsageState view={view} />

          {view.state === 'unavailable' && reportedCostUsd !== undefined && (
            <>
              <div className={classes.row}>
                <KpiTile
                  label="Reported cost"
                  hint="What the agents' runtimes themselves reported for your turns, summed over kagent's window. Only some runtimes report a cost, and only your own sessions are countable from here — never a fleet total."
                  value={formatUsd(reportedCostUsd)}
                  sub={`your sessions, over the last ${sessionWindowDays} days`}
                />
              </div>
              <Text variant="body-small" color="secondary">
                The one cost figure this installation can answer without the
                gateway's gen_ai metrics: what your agents' runtimes reported
                through kagent. The Your sessions tab breaks it down.
              </Text>
            </>
          )}

          {view.state === 'ready' && usage && (
            <>
              <CostKpiTiles
                usage={usage}
                currency={currency}
                windowDays={days}
              />
              {/* Beside the headline it qualifies: every figure on this page
                  understates the bill by what an unpriced model spent, and
                  the detail table below says which models and why. */}
              <PricingCoverageAlert rows={usage.unpricedModels} />
              <div className={classes.row}>
                <CostPerDayCard
                  daily={usage.costPerDay}
                  note={windowNote}
                  currency={currency}
                />
              </div>
              <LlmByAgentTable
                rows={usage.byAgent}
                currency={currency}
                emptyMessage="The gateway attributed no calls to an agent in this window."
                note="Each model call names its agent: the runtime sends the agent's name and namespace and the person on the call, the gateway records them for a call arriving through the Substrate egress and attributes any other call to the ServiceAccount of the pod that made it. A row covers everyone's traffic through that agent. An agent marked as removed matches none this portal knows — it has been removed since, or runs outside this portal's view — and its spend stays in the totals. Unattributed is traffic the gateway could match to no caller."
              />
              <LlmByModelTable
                rows={usage.byModel}
                currency={currency}
                emptyMessage="No model answered a call in this window."
                note="Cost/1M is a blend, not a list price: cache reads and writes count as tokens, so heavy caching pushes it below a model's headline rate. Average tokens per call is the one to watch for context creep — it rising is the usual reason a bill rises without more traffic."
              />
              <PricingCoverageNote rows={usage.unpricedModels} />
              <Text variant="body-small" color="secondary">
                {converted ? (
                  <>
                    Costs are measured in USD — the gateway prices each call
                    from its model catalogue as the call happens — and shown
                    here converted at this installation's configured rate, which
                    makes the displayed amounts estimates. Still not a provider
                    invoice: the catalogue is our own price list, and a model it
                    cannot price contributes nothing rather than raising an
                    error.
                  </>
                ) : (
                  <>
                    Costs are measured, not estimated: the gateway prices each
                    call from its model catalogue as the call happens. They are
                    still not a provider invoice — the catalogue is our own
                    price list — and a model it cannot price contributes nothing
                    rather than raising an error.
                  </>
                )}
              </Text>
            </>
          )}
        </Flex>
      </UsageColumn>
    </ShellAwareContent>
  );
}
