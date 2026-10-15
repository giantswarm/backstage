import { Flex } from '@backstage/ui';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  type Fact,
  FactList,
  FoldOutAlignedSection,
  TechnicalDetailsFoldOut,
} from '@giantswarm/backstage-plugin-ui-react';

import { ModelTechnicalDetails } from '../../ModelTechnicalDetails';

export type ModelDetailsTabProps = {
  modelConfig: ModelConfig;
  installation: string;
  /** The plain facts: what it calls, where, and since when. */
  facts: Fact[];
};

/**
 * The model page's Details tab: the plain facts first, then the ModelConfig
 * resource and the controller's conditions in a "Technical details"
 * fold-out, as the agent, connector and workflow pages keep theirs.
 */
export function ModelDetailsTab({
  modelConfig,
  installation,
  facts,
}: ModelDetailsTabProps) {
  return (
    <Flex direction="column" gap="5">
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
