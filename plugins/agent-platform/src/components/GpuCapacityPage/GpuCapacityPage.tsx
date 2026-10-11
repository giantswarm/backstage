import { useMemo } from 'react';
import { EmptyState } from '@backstage/core-components';
import { Flex, Text } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import { ModelHostingActions } from '../ModelHostingActions';
import { ShellAwareContent } from '../ShellAwareContent';
import { NO_SERVING_CAPABILITIES, backendsOn } from '../../lib/serving';
import {
  HIDE_INSTALLATION,
  isSoleInstallation,
} from '../../lib/soleInstallation';
import { useGpuNodePoolControls } from '../GpuNodePools';
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
// Why there is no inventory: no serving layer at all, one that runs no
// backend yet (model-manager ships that way), or layers that do not report
// their nodes.
function emptyStateDescription(
  installations: string[],
  noBackendYet: boolean,
): string {
  if (installations.length === 0) {
    return 'No reachable environment has a serving layer this portal can see. GPU capacity is read per node from environments whose serving layer reports one.';
  }
  if (noBackendYet) {
    return `model-manager on ${installations.join(
      ', ',
    )} is running with no backend registered: no GPU node pool serves models there yet, and no host reports its nodes. Add a GPU node pool, or register a backend that reports its nodes on the Serving view.`;
  }
  return 'The serving layers this portal can see do not report their nodes. GPU capacity is read per node from environments whose serving layer reports one: the nodes of a KServe-backed serving layer, or the host an Ollama-backed model-manager proxies (from model-manager 0.7 on — an older one reports no nodes).';
}

export type GpuCapacityPageProps = {
  /**
   * Whether the Model cache card closes the view. Inside the shell Model
   * hosting gives the cache a tab of its own (ModelCachePage), so it is left
   * out here; classic chrome keeps it on this view.
   */
  showModelCache?: boolean;
};

export function GpuCapacityPage({
  showModelCache = true,
}: GpuCapacityPageProps = {}) {
  const serving = useServing();
  const pools = useGpuNodePoolControls(
    serving.reachableInstallations,
    serving.servedModels,
    serving.scope,
  );
  // The view's one action, Add GPU node pool, as the header's primary at the
  // top right (ModelHostingActions), like every Model hosting view's.
  const { addAction } = pools;
  const headerActions = useMemo(
    () =>
      addAction ? (
        <ModelHostingActions
          primary={{
            id: 'add-pool',
            label: 'Add GPU node pool',
            icon: <AddIcon />,
            onAction: addAction.open,
            isDisabled: addAction.isDisabled,
          }}
        />
      ) : null,
    [addAction],
  );
  useProvidePageHeaderActions(headerActions);
  const cachePanel = showModelCache ? pools.cachePanel : undefined;

  const nodeInventoryInstallations = useMemo(
    () =>
      serving.installations.filter(
        installation =>
          (serving.capabilities?.[installation] ?? NO_SERVING_CAPABILITIES)
            .nodeInventory,
      ),
    [serving.installations, serving.capabilities],
  );
  const noBackendYet =
    serving.installations.length > 0 &&
    serving.installations.every(
      installation => backendsOn(serving, installation).length === 0,
    );

  // The page's shape is decided once everything is read: the list with its
  // cards while reading, the empty state only when there is nothing to list
  // — never one, then the other (giantswarm/backstage#2501).
  const reading = serving.isLoading || pools.isLoading;
  // Decided on the serving read alone: the node inventory comes from it, and
  // the cluster-manager reads behind the pools above can take much longer.
  const soleInstallation = isSoleInstallation({
    scope: serving.scope,
    isLoading: serving.isLoading,
    installations: nodeInventoryInstallations,
    unreachableInstallations: Object.keys(serving.gpuCapacityUnavailable),
  });
  if (!reading && nodeInventoryInstallations.length === 0) {
    return (
      <ShellAwareContent>
        {pools.dialogs}
        {pools.panel}
        <EmptyState
          missing="data"
          title={noBackendYet ? 'No GPU node pools yet' : 'No GPU inventory'}
          description={emptyStateDescription(
            serving.installations,
            noBackendYet,
          )}
          action={pools.addButton}
        />
        {cachePanel}
      </ShellAwareContent>
    );
  }

  return (
    <ShellAwareContent>
      <Flex direction="column" gap="3">
        {pools.dialogs}
        {pools.panel}
        <Text color="secondary">
          The nodes the served models run on, per environment: for a cluster
          node the product and memory from the node labels, what the device
          plugin makes schedulable and what scheduled pods already hold; for the
          host a backend runs on, its memory as the serving layer sees it and
          what the loaded models take of it.
        </Text>
        <GpuCapacityPanel
          nodes={serving.gpuNodes}
          installations={nodeInventoryInstallations}
          unavailable={serving.gpuCapacityUnavailable}
          isLoading={reading}
          hideColumns={soleInstallation ? HIDE_INSTALLATION : undefined}
        />
        {cachePanel}
      </Flex>
    </ShellAwareContent>
  );
}
