import { useMemo } from 'react';
import { Content, EmptyState } from '@backstage/core-components';
import { Flex, Text } from '@backstage/ui';

import { NO_SERVING_CAPABILITIES } from '../../lib/serving';
import { useServing } from '../ServingProvider';
import { GpuCapacityPanel } from './GpuCapacityPanel';

/**
 * The "GPU capacity" view of the Models tab: per-node GPU inventory on the
 * installations whose serving layer reports one — what the hardware is, what
 * is schedulable, what running models already hold. Keyed off the
 * `nodeInventory` capability, never off a backend's name: an Ollama-backed
 * installation has models but no node inventory, and shows up here only in
 * the empty state's explanation. Must be mounted inside a ServingProvider.
 */
export function GpuCapacityPage() {
  const serving = useServing();

  const nodeInventoryInstallations = useMemo(
    () =>
      serving.installations.filter(
        installation =>
          (serving.capabilities?.[installation] ?? NO_SERVING_CAPABILITIES)
            .nodeInventory,
      ),
    [serving.installations, serving.capabilities],
  );

  if (!serving.isLoading && nodeInventoryInstallations.length === 0) {
    return (
      <Content>
        <EmptyState
          missing="data"
          title="No GPU inventory"
          description={
            serving.installations.length > 0
              ? 'The serving layers this portal can see do not report their nodes. GPU capacity is read per node from installations with a KServe-backed serving layer.'
              : 'No reachable installation has a serving layer this portal can see. GPU capacity is read per node from installations with a KServe-backed serving layer.'
          }
        />
      </Content>
    );
  }

  return (
    <Content>
      <Flex direction="column" gap="3">
        <Text color="secondary">
          The GPU nodes the served models run on, per installation: the product
          and memory from the node labels, what the device plugin makes
          schedulable, and what scheduled pods already hold.
        </Text>
        <GpuCapacityPanel
          nodes={serving.gpuNodes}
          installations={nodeInventoryInstallations}
          unavailable={serving.gpuCapacityUnavailable}
          isLoading={serving.isLoading}
        />
      </Flex>
    </Content>
  );
}
