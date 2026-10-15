import { Alert, Card, CardBody, Flex, Text } from '@backstage/ui';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  type Fact,
  FactList,
  FoldOutAlignedSection,
  TechnicalDetailsFoldOut,
} from '@giantswarm/backstage-plugin-ui-react';

import { ModelServingStatus } from '../../ModelServingStatus';
import { ModelTechnicalDetails } from '../../ModelTechnicalDetails';
import type { ModelServedBy } from '../../ModelsTable';

export type ModelOverviewTabProps = {
  modelConfig: ModelConfig;
  installation: string;
  /** The plain facts: what it calls, where, and since when. */
  facts: Fact[];
  /** The serving layer's word on the model behind the config, where it has one. */
  servedBy: ModelServedBy | undefined;
  /** The tool that asserts the model, which would revert portal edits. */
  owner: string | undefined;
  /** Whether the form cannot speak the model's provider. */
  isUnsupportedProvider: boolean;
};

/**
 * The model page's Overview tab, the page's own address: whether the model is
 * served, why it cannot be edited here where that is not just the reader's
 * permissions, then what it calls, where and since when, and last the
 * ModelConfig resource and the controller's conditions in a "Technical
 * details" fold-out, as the agent, connector and workflow pages keep theirs.
 */
export function ModelOverviewTab({
  modelConfig,
  installation,
  facts,
  servedBy,
  owner,
  isUnsupportedProvider,
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
      {isUnsupportedProvider && !owner && (
        <Alert
          status="info"
          title={`Provider ${modelConfig.getProvider()} is not editable here`}
          description="The form covers OpenAI-compatible, Anthropic, Gemini and Ollama models; manage this one with kubectl."
        />
      )}
      <FoldOutAlignedSection aria-label="Model details">
        <FactList facts={facts} labelWidth={160} />
      </FoldOutAlignedSection>
      {/* Open on arrival while the controller has not accepted the model, as
          the agent page does for an agent that is not ready: the conditions
          there say why. It follows a fresh read that turns the model
          unhealthy (the page renders from the cache first); the page keys the
          tab per model, so it starts afresh on another. */}
      <TechnicalDetailsFoldOut
        defaultExpanded={modelConfig.getReadiness() !== 'accepted'}
        followDefaultExpanded
      >
        <ModelTechnicalDetails
          modelConfig={modelConfig}
          installation={installation}
        />
      </TechnicalDetailsFoldOut>
    </Flex>
  );
}
