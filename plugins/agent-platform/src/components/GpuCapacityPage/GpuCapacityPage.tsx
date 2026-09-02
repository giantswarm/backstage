import { useMemo } from 'react';
import { Content, EmptyState } from '@backstage/core-components';
import { Flex, Text } from '@backstage/ui';

import { NO_SERVING_CAPABILITIES } from '../../lib/serving';
import { useServing } from '../ServingProvider';
import { GpuCapacityPanel } from './GpuCapacityPanel';

/**
 * The "GPU capacity" view of the Models tab: per-node inventory on the
 * installations whose serving layer reports one — for a cluster node what the
 * hardware is, what is schedulable and what running models already hold; for
 * the host a backend runs on (Ollama, through model-manager) the host's memory
 * as the serving layer sees it and what the loaded models take of it. Keyed
 * off the `nodeInventory` capability, never off a backend's name: an
 * Ollama-backed installation reports its host once its model-manager does (an
 * older one reports no nodes and shows up only in the empty state's
 * explanation). Must be mounted inside a ServingProvider.
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
              ? 'The serving layers this portal can see do not report their nodes. GPU capacity is read per node from installations whose serving layer reports one: the nodes of a KServe-backed serving layer, or the host an Ollama-backed model-manager proxies (from model-manager 0.7 on — an older one reports no nodes).'
              : 'No reachable installation has a serving layer this portal can see. GPU capacity is read per node from installations whose serving layer reports one.'
          }
        />
      </Content>
    );
  }

  return (
    <Content>
      <Flex direction="column" gap="3">
        <Text color="secondary">
          The nodes the served models run on, per installation: for a cluster
          node the product and memory from the node labels, what the device
          plugin makes schedulable and what scheduled pods already hold; for the
          host a backend runs on, its memory as the serving layer sees it and
          what the loaded models take of it.
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
