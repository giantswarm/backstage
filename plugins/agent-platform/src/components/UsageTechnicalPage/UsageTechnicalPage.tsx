import { ReactNode } from 'react';
import { Flex, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import { useLlmUsageView } from '../../hooks/useLlmUsageView';
import { useUsageWindow } from '../../hooks/useUsageWindow';
import { useCurrency } from '../../lib/formatNumbers';
import {
  CostTotalsStrip,
  LlmUsageState,
  ReliabilityStrip,
  TokensByTypeCard,
  UsageCard,
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
 * The Usage screen's raw-numbers view, for admins and platform engineers: the
 * token and model-call figures behind the cost views, the gateway's health,
 * and — when the muster plugin contributed one — the connector tool-call
 * section.
 *
 * These numbers explain the spend; they do not add to it. That framing is the
 * page's first line, because a token total next to a spend total otherwise
 * reads as a second bill.
 *
 * The muster section arrives through the `sections` extension input, so muster
 * needs no knowledge of this layout: the contract is still the node id
 * `sub-page:agent-platform/usage` and the input name `sections`, exactly as
 * `mcpUsageSection` in the muster plugin declares it. Without a contribution
 * the gateway content stands alone — the view exists either way.
 */
export function UsageTechnicalPage({ sections }: { sections?: ReactNode[] }) {
  const classes = useStyles();
  const { days } = useUsageWindow();
  const view = useLlmUsageView({ days });
  const { usage, installation } = view;
  const currency = useCurrency(installation);
  const hasSections = (sections?.length ?? 0) > 0;

  // Today's bar is real spend so far — queried over elapsed-time-since-midnight
  // rather than extrapolated to a whole day.
  const windowNote = `The last ${days} days.`;

  return (
    <ShellAwareContent>
      <UsageColumn>
        <Flex direction="column" gap="6">
          {/* One short caption, not a heading: the tab above already names
              the view. It still leads with the framing, because a token
              total next to a spend total otherwise reads as a second bill. */}
          <Text as="p" variant="body-medium" color="secondary">
            {installation ? (
              <>
                The numbers behind the cost views on{' '}
                <strong>{installation}</strong>, over the last {days} days. They
                explain the spend — they don't add to it.
              </>
            ) : (
              `The numbers behind the cost views. They explain the spend — they don't add to it.`
            )}
          </Text>

          <LlmUsageState view={view} />

          {view.state === 'ready' && usage && (
            <>
              <CostTotalsStrip
                usage={usage}
                windowDays={days}
                currency={currency}
              />

              <div className={classes.row}>
                <TokensByTypeCard
                  daily={usage.tokensPerDay}
                  note={windowNote}
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
