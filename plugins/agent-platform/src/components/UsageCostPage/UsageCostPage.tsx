import { Content } from '@backstage/core-components';
import { Flex, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';
import { useLlmUsageView } from '../../hooks/useLlmUsageView';
import { useUsageWindow } from '../../hooks/useUsageWindow';
import { isConvertedCurrency, useCurrency } from '../../lib/formatNumbers';
import {
  CostPerDayCard,
  LlmByAgentTable,
  LlmByModelTable,
  LlmUsageState,
  PricingCoverageNote,
} from '../LlmUsage';

const useStyles = makeStyles((theme: Theme) => ({
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(3),
  },
}));

/**
 * Where the money went: spend over time, and the full breakdowns by agent and
 * by model.
 *
 * The two breakdowns and the Overview's tiles are reductions of the same two
 * Mimir answers, so they cannot disagree — and because both views run the same
 * queries through react-query's cache, switching between them costs nothing.
 *
 * Both tables are also the **table view** the charts require: several hues in
 * the categorical palette sit below 3:1 against the card surface, so the exact
 * figures have to be readable somewhere that does not depend on telling two
 * fills apart.
 */
export function UsageCostPage() {
  const classes = useStyles();
  const { days } = useUsageWindow();
  const view = useLlmUsageView({ days });
  const { usage, installation } = view;
  const currency = useCurrency(installation);
  const converted = isConvertedCurrency(currency);

  // Today's bar is real spend so far — queried over elapsed-time-since-midnight
  // rather than extrapolated to a whole day — and that it therefore sits below
  // a full day needs no saying: a reader looking at a partial day already
  // knows what time it is.
  const windowNote = `The last ${days} days.`;

  return (
    <Content>
      <Flex direction="column" gap="6" style={{ maxWidth: 1024 }}>
        <SectionHeader
          as="h2"
          variant="title-medium"
          title="Cost"
          description={
            installation ? (
              <>
                Spend on <strong>{installation}</strong> over the last {days}{' '}
                days, for every user, priced per call from the gateway's own
                model catalogue.
              </>
            ) : (
              `Spend over the last ${days} days, for every user, priced per call from the gateway's own model catalogue.`
            )
          }
        />

        <LlmUsageState view={view} />

        {view.state === 'ready' && usage && (
          <>
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
                  Costs are measured in USD — the gateway prices each call from
                  its model catalogue as the call happens — and shown here
                  converted at this installation's configured rate, which makes
                  the displayed amounts estimates. Still not a provider invoice:
                  the catalogue is our own price list, and a model it cannot
                  price contributes nothing rather than raising an error.
                </>
              ) : (
                <>
                  Costs are measured, not estimated: the gateway prices each
                  call from its model catalogue as the call happens. They are
                  still not a provider invoice — the catalogue is our own price
                  list — and a model it cannot price contributes nothing rather
                  than raising an error.
                </>
              )}
            </Text>
          </>
        )}
      </Flex>
    </Content>
  );
}
