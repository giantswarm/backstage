import { EmptyStateCard } from '@giantswarm/backstage-plugin-ui-react';

import { useGpuNodePoolControls } from '../GpuNodePools';
import { useModelHostingSharedIdentity } from '../ModelHostingSharedIdentity';
import { useServing } from '../ServingProvider';

/**
 * The "Model cache" view of Model hosting: the volumes model weights are
 * cached on, per cluster, as cluster-manager lists them — their size, price
 * and since when, with **Remove cache** where the installation's
 * cluster-manager offers it. A tab of its own, per the prototype.
 *
 * Where no reachable installation runs cluster-manager there are no claims to
 * list and the empty state says so — or, where cluster-manager is withheld for
 * want of a per-user sign-in, points at the page's note on why. Must be
 * mounted inside a ServingProvider and the plugin's QueryClientProvider.
 */
export function ModelCachePage() {
  const serving = useServing();
  const pools = useGpuNodePoolControls(
    serving.reachableInstallations,
    serving.servedModels,
    serving.scope,
  );
  const sharedIdentity = useModelHostingSharedIdentity();

  return (
    <>
      {pools.dialogs}
      {pools.cachePanel ?? (
        <EmptyStateCard
          title="No model cache"
          description={
            sharedIdentity.clusterManager.length > 0
              ? 'The model cache keeps model weights between serves. cluster-manager lists it per cluster, and no environment in reach runs one this portal can reach as you (see above).'
              : 'The model cache keeps model weights between serves. cluster-manager lists it per cluster, and no environment in reach runs cluster-manager.'
          }
        />
      )}
    </>
  );
}
