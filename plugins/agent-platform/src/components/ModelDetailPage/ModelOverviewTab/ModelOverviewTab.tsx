import { useMemo } from 'react';
import { Alert, Card, CardBody, Flex, Text } from '@backstage/ui';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import { PageSection } from '@giantswarm/backstage-plugin-ui-react';

import { formatMoney, useCurrency } from '../../../lib/formatNumbers';
import { useAgents } from '../../AgentsDataProvider';
import { type AgentUsage, AgentUsageList } from '../../AgentUsageList';
import { ModelServingStatus } from '../../ModelServingStatus';
import type { ModelServedBy } from '../../ModelsTable';
import { agentsUsingModel, modelConfigIdOf } from '../modelUsage';
import { MODEL_USAGE_WINDOW_DAYS, type ModelUsage } from '../useModelUsage';

/**
 * The agents whose spec names this ModelConfig, as the skill and connector
 * pages list theirs (`AgentUsageList`): each linking to its own page, with
 * what it spent on the model at the row's end once the gateway's figures are
 * in.
 */
function UsedBySection({
  installation,
  namespace,
  name,
  usage: { slice },
}: {
  installation: string;
  namespace: string;
  name: string;
  usage: ModelUsage;
}) {
  const currency = useCurrency(installation);
  const { rows, isLoading, unreachableInstallations } = useAgents();
  const agents = useMemo<AgentUsage[]>(
    () =>
      agentsUsingModel(
        rows,
        modelConfigIdOf(installation, namespace, name),
      ).map(row => {
        if (!slice) {
          return { row };
        }
        const spent = slice.byAgent.get(
          `${row.namespace}/${row.technicalName}`,
        );
        // No calls is zero spend; calls without a price are "—".
        return {
          row,
          detail: formatMoney(
            !spent || spent.calls === 0 ? 0 : spent.costUsd,
            currency,
          ),
        };
      }),
    [rows, installation, namespace, name, slice, currency],
  );

  return (
    <PageSection
      title="Used by"
      description={
        slice && agents.length > 0
          ? `Each agent shows its spend on this model over the last ${MODEL_USAGE_WINDOW_DAYS} days.`
          : undefined
      }
    >
      <AgentUsageList
        agents={agents}
        label="Agents using this model"
        emptyText={
          unreachableInstallations.includes(installation)
            ? `The agents on ${installation} could not be read.`
            : 'No agent runs on this model yet.'
        }
        isLoading={isLoading && agents.length === 0}
      />
    </PageSection>
  );
}

export type ModelOverviewTabProps = {
  modelConfig: ModelConfig;
  installation: string;
  namespace: string;
  name: string;
  /** The serving layer's word on the model behind the config, where it has one. */
  servedBy: ModelServedBy | undefined;
  /** The tool that asserts the model, which would revert portal edits. */
  owner: string | undefined;
  /** Whether the form cannot speak the model's provider. */
  isUnsupportedProvider: boolean;
  usage: ModelUsage;
};

/**
 * The model page's Overview tab, the page's own address: whether the model is
 * served, why it cannot be edited here where that is not just the reader's
 * permissions, and the agents that run on it.
 */
export function ModelOverviewTab({
  modelConfig,
  installation,
  namespace,
  name,
  servedBy,
  owner,
  isUnsupportedProvider,
  usage,
}: ModelOverviewTabProps) {
  return (
    <Flex direction="column" gap="5">
      {/* The same block the Model configs list shows in its Endpoint cell:
          what the serving layer says about the model behind this config, and
          the fix where there is one. Nothing for provider defaults and
          external endpoints. */}
      {servedBy && (
        <Card>
          <CardBody>
            <Flex direction="column" gap="2">
              <ModelServingStatus
                serving={servedBy}
                shortcut={servedBy.shortcut}
                variant="block"
              />
              <Text variant="body-small" color="secondary">
                {servedBy.message}
              </Text>
            </Flex>
          </CardBody>
        </Card>
      )}
      {owner && (
        <Alert
          status="info"
          title={`Managed by ${owner}`}
          description={`${owner} asserts this model and would revert portal edits. Change it where ${owner} is configured.`}
        />
      )}
      {isUnsupportedProvider && !owner && (
        <Alert
          status="info"
          title={`Provider ${modelConfig.getProvider()} is not editable here`}
          description="The form covers OpenAI-compatible, Anthropic, Gemini and Ollama models; manage this one with kubectl."
        />
      )}
      <UsedBySection
        installation={installation}
        namespace={namespace}
        name={name}
        usage={usage}
      />
    </Flex>
  );
}
