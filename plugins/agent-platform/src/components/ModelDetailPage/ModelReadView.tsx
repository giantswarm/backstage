import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Link } from '@backstage/core-components';
import { Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  LoadingIndicator,
  SectionHeader,
  Stat,
  StatGrid,
} from '@giantswarm/backstage-plugin-ui-react';

import { useLlmUsage } from '../../hooks/useLlmUsage';
import {
  formatCount,
  formatMoney,
  formatTokens,
  useCurrency,
} from '../../lib/formatNumbers';
import { agentDetailRouteRef } from '../../routes';
import { AgentAvatar } from '../AgentAvatar';
import { CostPerDayCard } from '../LlmUsage';
import { ShowMore, USED_BY_ROWS } from '../ShowMore';
import { useAgents } from '../AgentsDataProvider';
import {
  agentsUsingModel,
  modelConfigIdOf,
  modelUsageSlice,
  type ModelUsageSlice,
} from './modelUsage';

/** The window the page reads: the prototype's "last 30 days". */
export const MODEL_USAGE_WINDOW_DAYS = 30;

const useStyles = makeStyles(theme => ({
  agentList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  agentRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.5, 0.5),
    borderBottom: '1px solid var(--bui-border-1, #edf2f5)',
  },
  agentName: {
    flex: '1 1 160px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  agentCost: {
    flex: '0 0 auto',
    marginLeft: 'auto',
    fontVariantNumeric: 'tabular-nums',
  },
}));

export type ModelReadViewProps = {
  installation: string;
  namespace: string;
  name: string;
  /** The ModelConfig's `spec.model`: what the gateway's metrics are keyed by. */
  model: string | undefined;
  /** The model's name for people, the chart's series name. */
  label: string;
};

/** The gateway's figures for this model, or why there are none. */
function UsageSection({
  installation,
  model,
  slice,
  state,
}: {
  installation: string;
  model: string | undefined;
  slice: ModelUsageSlice | undefined;
  state: 'loading' | 'unavailable' | 'error' | 'ready';
}) {
  const currency = useCurrency(installation);

  if (!model) {
    return (
      <Text as="p" variant="body-small" color="secondary">
        No model ID set, so its usage cannot be matched to the gateway's
        figures.
      </Text>
    );
  }
  if (state === 'loading') {
    return <LoadingIndicator label="Reading this model's usage…" />;
  }
  if (state === 'unavailable') {
    return (
      <Text as="p" variant="body-small" color="secondary">
        Cost and token figures need the gateway's metrics, which {installation}{' '}
        does not publish to a store this portal can read.
      </Text>
    );
  }
  if (state === 'error' || !slice) {
    return (
      <Text as="p" variant="body-small" color="secondary">
        Cost and token figures could not be read right now.
      </Text>
    );
  }

  const sub = `every user's, last ${MODEL_USAGE_WINDOW_DAYS} days`;
  return (
    <Flex direction="column" gap="4">
      <StatGrid>
        <Stat
          variant="tile"
          label="Spend"
          hint="Shows the gateway's price for calls to this model. A model missing from its catalogue shows —."
          // No calls is zero spend; calls without a price are "—".
          value={formatMoney(slice.calls === 0 ? 0 : slice.costUsd, currency)}
          sub={sub}
        />
        <Stat
          variant="tile"
          label="Tokens"
          hint="Counts the tokens that calls to this model used, as the gateway counted them."
          value={formatTokens(slice.tokens)}
          sub={sub}
        />
        <Stat
          variant="tile"
          label="Model calls"
          hint="Counts how often agents called this model through the gateway."
          value={formatCount(slice.calls)}
          sub={sub}
        />
      </StatGrid>
      {slice.costPerDay.series.length > 0 && (
        // One model, the page's own: the key would only repeat its name.
        <CostPerDayCard
          daily={slice.costPerDay}
          currency={currency}
          showLegend={false}
        />
      )}
      <Text as="p" variant="body-small" color="secondary">
        {slice.calls === 0
          ? `No calls to ${model} went through the gateway in the last ${MODEL_USAGE_WINDOW_DAYS} days.`
          : `This counts every gateway call to ${model} from any agent, including those through other configurations of this model on ${installation}.`}
      </Text>
    </Flex>
  );
}

/** The agents whose spec names this ModelConfig, each with what it spent on it. */
function UsedBySection({
  installation,
  namespace,
  name,
  slice,
}: {
  installation: string;
  namespace: string;
  name: string;
  slice: ModelUsageSlice | undefined;
}) {
  const classes = useStyles();
  const currency = useCurrency(installation);
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);
  const { rows, isLoading, unreachableInstallations } = useAgents();
  const agents = useMemo(
    () =>
      agentsUsingModel(rows, modelConfigIdOf(installation, namespace, name)),
    [rows, installation, namespace, name],
  );

  let body;
  if (isLoading && agents.length === 0) {
    body = <LoadingIndicator label="Reading the agents…" />;
  } else if (agents.length === 0) {
    body = (
      <Text as="p" variant="body-medium" color="secondary">
        {unreachableInstallations.includes(installation)
          ? `The agents on ${installation} could not be read.`
          : 'No agent runs on this model yet.'}
      </Text>
    );
  } else {
    body = (
      <ShowMore items={agents} initial={USED_BY_ROWS} noun="agent" revealAll>
        {shown => (
          <ul
            className={classes.agentList}
            aria-label="Agents using this model"
          >
            {shown.map(agent => {
              const href = agentDetailRoute?.({
                installation: agent.installation,
                namespace: agent.namespace,
                name: agent.technicalName,
              });
              const spent = slice?.byAgent.get(
                `${agent.namespace}/${agent.technicalName}`,
              );
              return (
                <li key={agent.id} className={classes.agentRow}>
                  <AgentAvatar
                    size="small"
                    purpose="decoration"
                    name={agent.name}
                    src=""
                  />
                  <span className={classes.agentName}>
                    {href ? (
                      <Link to={href}>
                        <Text
                          as="span"
                          variant="body-medium"
                          style={{ color: 'inherit' }}
                        >
                          {agent.name}
                        </Text>
                      </Link>
                    ) : (
                      <Text variant="body-medium">{agent.name}</Text>
                    )}
                    {agent.description && (
                      <Text variant="body-small" color="secondary">
                        {agent.description}
                      </Text>
                    )}
                  </span>
                  {slice && (
                    <Text
                      variant="body-small"
                      color="secondary"
                      className={classes.agentCost}
                    >
                      {formatMoney(
                        !spent || spent.calls === 0 ? 0 : spent.costUsd,
                        currency,
                      )}
                    </Text>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ShowMore>
    );
  }

  return (
    <section aria-label="Used by">
      <Flex direction="column" gap="2">
        <SectionHeader as="h2" variant="title-x-small" title="Used by" />
        {body}
      </Flex>
    </section>
  );
}

/**
 * The model as a read view, per the prototype: what it cost and how much it
 * was used over the last 30 days (the gateway's figures, from the Usage
 * screen's own reductions), the cost per day, and the agents that run on it
 * with what each spent on it.
 *
 * The agents come from the `AgentsDataProvider` above the page
 * (`CustomizeModelPage` mounts it): the gateway reduction names agents
 * through it, and "Used by" filters it. No provider of its own, so the page
 * never runs the agent reads twice.
 */
export function ModelReadView({
  installation,
  namespace,
  name,
  model,
  label,
}: ModelReadViewProps) {
  // Everyone's model calls through the gateway, narrowed to this model — the
  // same queries (and cache entries) the Usage screen's 30-day view reads.
  const gateway = useLlmUsage(installation, {
    days: MODEL_USAGE_WINDOW_DAYS,
  });
  const slice = useMemo(
    () =>
      gateway.usage ? modelUsageSlice(gateway.usage, model, label) : undefined,
    [gateway.usage, model, label],
  );
  let state: 'loading' | 'unavailable' | 'error' | 'ready' = 'ready';
  if (gateway.isLoading) {
    state = 'loading';
  } else if (gateway.isAvailable === false) {
    state = 'unavailable';
  } else if (gateway.isError || !gateway.usage) {
    state = 'error';
  }

  return (
    <Flex direction="column" gap="6">
      <UsageSection
        installation={installation}
        model={model}
        slice={slice}
        state={state}
      />
      <UsedBySection
        installation={installation}
        namespace={namespace}
        name={name}
        slice={state === 'ready' ? slice : undefined}
      />
    </Flex>
  );
}
