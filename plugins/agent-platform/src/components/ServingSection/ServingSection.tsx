import { useMemo } from 'react';
import { Progress } from '@backstage/core-components';
import { Flex } from '@backstage/ui';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';

import { findServedModelForEndpoint } from '../../lib/serving';
import { useModelConfigs } from '../ModelConfigsProvider';
import { useServing } from '../ServingProvider';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';
import { GpuCapacityPanel } from './GpuCapacityPanel';
import { ServedModelsTable, type ServedModelRow } from './ServedModelsTable';

/**
 * The read-only serving layer beneath the ModelConfigs: which models are
 * served in-cluster, where, on what, and the GPU capacity they draw on.
 *
 * Renders nothing at all — no heading, no empty table — unless at least one
 * reachable installation has a serving backend (or could not be asked), so
 * portals without one never see a Serving section. Must be mounted inside
 * both a ServingProvider and a ModelConfigsProvider: the "Used by" column
 * resolves ModelConfigs against the served models' endpoints.
 */
export function ServingSection() {
  const serving = useServing();
  const { modelConfigsFor } = useModelConfigs();

  const rows = useMemo<ServedModelRow[]>(
    () =>
      serving.servedModels.map(model => {
        // Every ModelConfig on the same installation whose endpoint points at
        // this served model — the inverse of the "Served by" line on the
        // ModelConfig rows, computed with the same matcher.
        const usedBy = modelConfigsFor(model.installation)
          .filter(
            modelConfig =>
              findServedModelForEndpoint(modelConfig.getEndpoint(), [model]) ===
              model,
          )
          .map(modelConfig => ({
            installation: model.installation,
            namespace: modelConfig.getNamespace() ?? '',
            name: modelConfig.getName(),
            displayName: modelConfig.getDisplayName(),
          }));
        return { ...model, usedBy };
      }),
    [serving.servedModels, modelConfigsFor],
  );

  if (
    serving.installations.length === 0 &&
    serving.unreachableInstallations.length === 0
  ) {
    return null;
  }

  return (
    <Flex direction="column" gap="3">
      <SectionHeader
        title="Serving"
        description="Models served in-cluster — KServe InferenceServices on the installations that have a serving layer — and the GPU capacity they run on. Read-only: the ModelConfigs above are how agents reach them."
      />

      {serving.isLoading && rows.length === 0 ? (
        <Progress aria-label="Loading served models" />
      ) : (
        <ServedModelsTable rows={rows} />
      )}

      <UnreachableInstallationsAlert
        installations={serving.unreachableInstallations}
        resourceName="InferenceServices"
      />

      {serving.installations.length > 0 && (
        <GpuCapacityPanel
          nodes={serving.gpuNodes}
          installations={serving.installations}
          unavailable={serving.gpuCapacityUnavailable}
          isLoading={serving.isLoading}
        />
      )}
    </Flex>
  );
}
