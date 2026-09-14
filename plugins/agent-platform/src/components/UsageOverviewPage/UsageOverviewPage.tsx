import { Content } from '@backstage/core-components';
import { Flex, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { usageCostRouteRef } from '../../routes';
import { useLlmUsageView } from '../../hooks/useLlmUsageView';
import { WINDOW_DAYS } from '../../lib/llmUsageQueries';
import {
  CostPerDayCard,
  CostTotalsStrip,
  LlmUsageState,
  PricingCoverageAlert,
  ReliabilityStrip,
  TokensByTypeCard,
  UsageCard,
} from '../LlmUsage';

const useStyles = makeStyles((theme: Theme) => ({
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(3),
  },
}));

/**
 * The window, and nothing else.
 *
 * Today's bar is real spend so far — queried over elapsed-time-since-midnight
 * rather than extrapolated to a whole day — and that it therefore sits below a
 * full day needs no saying: a reader looking at a partial day already knows
 * what time it is.
 */
const WINDOW_NOTE = `The last ${WINDOW_DAYS} days.`;

/**
 * The Usage tab's at-a-glance view: what the platform's model calls cost, how
 * many tokens they moved, and whether they are going well.
 *
 * **Everyone's traffic, not the reader's.** These come from the agentgateway
 * LLM listener, which sees every call regardless of who started it — which is
 * also why they cannot be broken down per user: the metrics carry no user
 * label. The per-user view is the Your sessions tab, and it is kagent's.
 *
 * The corollary — that an agent calling a provider directly bypasses the
 * listener and so appears nowhere here — is deliberately **not** in the
 * heading. It is a real limitation, and it is documented in
 * `docs/agent-platform.md` under "What it cannot show", but on the platform's
 * own installations every agent goes through the gateway, so leading with it
 * cast doubt on figures that are in fact complete. The empty state still says
 * it, which is the one place a reader needs it.
 */
export function UsageOverviewPage() {
  const classes = useStyles();
  const view = useLlmUsageView();
  const costRoute = useRouteRef(usageCostRouteRef);
  const { usage, installation, isResolvedFromAll } = view;

  return (
    <Content>
      <Flex direction="column" gap="6" style={{ maxWidth: 1024 }}>
        <SectionHeader
          as="h2"
          variant="title-medium"
          title="Overview"
          description={
            installation
              ? `Every user's model calls on ${installation} over the last ${WINDOW_DAYS} days, as seen by the agentgateway LLM listener.`
              : `Model usage across the platform, as seen by the agentgateway LLM listener.`
          }
        />

        {isResolvedFromAll && installation && (
          <Text variant="body-small" color="secondary">
            Showing {installation}. Metrics are read one installation at a time
            — pin another in the header to switch.
          </Text>
        )}

        <LlmUsageState view={view} />

        {view.state === 'ready' && usage && (
          <>
            <CostTotalsStrip usage={usage} />

            {/* Compact here, with the detail table one tab away: the reader of
                this page needs to know the cost figures are incomplete, not
                which models to add to the catalogue. */}
            <PricingCoverageAlert
              rows={usage.unpricedModels}
              costHref={costRoute?.()}
            />

            <div className={classes.row}>
              <CostPerDayCard daily={usage.costPerDay} note={WINDOW_NOTE} />
            </div>
            <div className={classes.row}>
              <TokensByTypeCard daily={usage.tokensPerDay} note={WINDOW_NOTE} />
            </div>

            <UsageCard
              title="Gateway health"
              wide
              note="The whole model call, request to response — not time to first token, which the gateway only reports for a streamed reply and an agent turn never is."
            >
              <ReliabilityStrip reliability={usage.reliability} />
            </UsageCard>
          </>
        )}
      </Flex>
    </Content>
  );
}
