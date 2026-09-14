import { Content } from '@backstage/core-components';
import { Flex, Text } from '@backstage/ui';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';
import { useLlmUsageView } from '../../hooks/useLlmUsageView';
import { WINDOW_DAYS } from '../../lib/llmUsageQueries';
import {
  LlmByAgentTable,
  LlmByModelTable,
  LlmUsageState,
  PricingCoverageNote,
} from '../LlmUsage';

/**
 * Where the money went: spend and volume broken down by agent and by model.
 *
 * The two breakdowns and the Overview's tiles are reductions of the same two
 * Mimir answers, so they cannot disagree — and because both views run the same
 * nine queries through react-query's cache, switching between them costs
 * nothing.
 *
 * Both tables are also the **table view** the charts on Overview require:
 * several hues in the categorical palette sit below 3:1 against the card
 * surface, so the exact figures have to be readable somewhere that does not
 * depend on telling two fills apart.
 */
export function UsageCostPage() {
  const view = useLlmUsageView();
  const { usage, installation } = view;

  return (
    <Content>
      <Flex direction="column" gap="6" style={{ maxWidth: 1024 }}>
        <SectionHeader
          as="h2"
          variant="title-medium"
          title="Cost"
          description={
            installation
              ? `Spend on ${installation} over the last ${WINDOW_DAYS} days, for every user, priced per call from the gateway's own model catalogue.`
              : `Spend over the last ${WINDOW_DAYS} days, for every user, priced per call from the gateway's own model catalogue.`
          }
        />

        <LlmUsageState view={view} />

        {view.state === 'ready' && usage && (
          <>
            <LlmByAgentTable
              rows={usage.byAgent}
              emptyMessage="The gateway attributed no calls to an agent in this window."
              note="An agent is the ServiceAccount of the pod that made the call, so a row covers everyone's traffic through that agent. A name that resolves to no agent here has been deleted since, or runs outside this portal's view; its spend is still in the totals."
            />
            <LlmByModelTable
              rows={usage.byModel}
              emptyMessage="No model answered a call in this window."
              note="$/1M is a blend, not a list price: cache reads and writes count as tokens, so heavy caching pushes it below a model's headline rate. Average tokens per call is the one to watch for context creep — it rising is the usual reason a bill rises without more traffic."
            />
            <PricingCoverageNote rows={usage.unpricedModels} />
            <Text variant="body-small" color="secondary">
              Costs are measured, not estimated: the gateway prices each call
              from its model catalogue as the call happens. They are still not a
              provider invoice — the catalogue is our own price list — and a
              model it cannot price contributes nothing rather than raising an
              error.
            </Text>
          </>
        )}
      </Flex>
    </Content>
  );
}
