import { EmptyStateCard } from '@giantswarm/backstage-plugin-ui-react';

import { useGpuNodePoolControls } from '../GpuNodePools';
import { ShellAwareContent } from '../ShellAwareContent';
import { useServing } from '../ServingProvider';

/**
 * The "Model cache" view of Model hosting: the volumes model weights are
 * cached on, per cluster, as cluster-manager lists them — their size, price
 * and since when, with **Remove cache** where the installation's
 * cluster-manager offers it. The same card the GPU capacity view shows in
 * classic chrome, as a tab of its own inside the shell, per the prototype.
 *
 * Where no reachable installation runs cluster-manager there are no claims to
 * list and the empty state says so. Must be mounted inside a ServingProvider
 * and the plugin's QueryClientProvider.
 */
export function ModelCachePage() {
  const serving = useServing();
  const pools = useGpuNodePoolControls(
    serving.reachableInstallations,
    serving.servedModels,
    serving.scope,
  );

  return (
    <ShellAwareContent>
      {pools.dialogs}
      {pools.cachePanel ?? (
        <EmptyStateCard
          title="No model cache"
          description="The model cache keeps model weights between serves. cluster-manager lists it per cluster, and no environment in reach runs cluster-manager."
        />
      )}
    </ShellAwareContent>
  );
}
