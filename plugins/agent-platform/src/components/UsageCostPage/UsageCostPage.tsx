import { Flex, Text } from '@backstage/ui';
import { Stat } from '@giantswarm/backstage-plugin-ui-react';
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
  DataStartNote,
  LlmByAgentTable,
  LlmByModelTable,
  LlmUsageState,
  PricingCoverageAlert,
  PricingCoverageNote,
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
  const costUsd =
    !sessionUsage.isNotDeployed && !sessionUsage.isError
      ? sessionUsage.usage?.totals.costUsd
      : undefined;
  const sessionWindowDays = sessionUsage.usage?.windowDays || 30;

  // Today's bar is real spend so far — queried over elapsed-time-since-midnight
  // rather than extrapolated to a whole day — and that it therefore sits below
  // a full day needs no saying: a reader looking at a partial day already
  // knows what time it is.
  const windowNote = `The last ${days} days.`;

  return (
    <UsageColumn>
      <Flex direction="column" gap="6">
        {/* One short caption, not a heading: the tab above already names
            the view. How the spend is priced is the footnote's to say. */}
        <Text as="p" variant="body-medium" color="secondary">
          {installation ? (
            <>
              Shows the spend on <strong>{installation}</strong> over the last{' '}
              {days} days, for every user.
            </>
          ) : (
            `Shows the spend over the last ${days} days, for every user.`
          )}
        </Text>

        <LlmUsageState view={view} />

        {view.state === 'unavailable' && costUsd !== undefined && (
          <>
            <div className={classes.row}>
              <Stat
                variant="tile"
                label="Reported cost"
                hint="Shows what your agents' runtimes reported for your turns, over kagent's window. Only some runtimes report a cost, and there is never a fleet total."
                value={formatUsd(costUsd)}
                sub={`your sessions, over the last ${sessionWindowDays} days`}
              />
            </div>
            <Text variant="body-small" color="secondary">
              This is the only cost figure available without the gateway's
              gen_ai metrics. The Your sessions tab breaks it down.
            </Text>
          </>
        )}

        {view.state === 'ready' && usage && (
          <>
            <DataStartNote usage={usage} />
            <CostKpiTiles usage={usage} currency={currency} windowDays={days} />
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
              note="The runtime names each call's agent and person; the gateway records them for calls through the Substrate egress and attributes any other call to the calling pod's ServiceAccount. A row covers everyone's traffic through that agent. Removed marks an agent this portal no longer knows, and its spend stays in the totals. Unattributed marks traffic matched to no caller."
            />
            <LlmByModelTable
              rows={usage.byModel}
              currency={currency}
              emptyMessage="No model answered a call in this window."
              note="Cost/1M is a blend, not a list price: cached tokens count, so heavy caching pushes it below a model's headline rate. Watch average tokens per call for context creep — the usual reason a bill rises without more traffic."
            />
            <PricingCoverageNote rows={usage.unpricedModels} />
            <Text variant="body-small" color="secondary">
              {converted ? (
                <>
                  Measured in USD per call from the gateway's model catalogue
                  and converted at this environment's configured rate, so these
                  are estimates. They are not a provider invoice, because the
                  catalogue is our own price list and a model it cannot price
                  adds nothing.
                </>
              ) : (
                <>
                  Measured, not estimated: the gateway prices each call from its
                  model catalogue. It is still not a provider invoice, because
                  the catalogue is our own price list and a model it cannot
                  price adds nothing.
                </>
              )}
            </Text>
          </>
        )}
      </Flex>
    </UsageColumn>
  );
}
