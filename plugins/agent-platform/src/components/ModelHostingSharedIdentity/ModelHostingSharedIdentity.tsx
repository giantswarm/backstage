import { useClusterManagerAvailability } from '../../hooks/useClusterManager';
import { useModelManagerInstallations } from '../../hooks/useModelManagerInstallations';
import { useServing } from '../ServingProvider';
import { SharedIdentityNote } from '../SharedIdentityNote';

/** What goes through cluster-manager on Model hosting, as a reason's subject. */
export const GPU_POOLS_VIA =
  'GPU node pools are managed through cluster-manager';
/** What goes through model-manager on Model hosting, as a reason's subject. */
export const MODEL_SERVING_VIA = 'Models are served through model-manager';

export type ModelHostingSharedIdentity = {
  /** Reachable installations whose cluster-manager is `sharedIdentity`. */
  clusterManager: string[];
  /** Reachable installations whose model-manager is `sharedIdentity`. */
  modelManager: string[];
};

/**
 * The reachable installations on which Model hosting withholds cluster-manager
 * or model-manager because their muster has no per-user sign-in in this
 * portal. Both managers are treated there as if absent; this is what lets
 * the page say why. Must be mounted inside a ServingProvider.
 */
export function useModelHostingSharedIdentity(): ModelHostingSharedIdentity {
  const serving = useServing();
  const reachable = serving.reachableInstallations ?? [];
  const clusterManager = useClusterManagerAvailability(reachable);
  const modelManager = useModelManagerInstallations(reachable);
  return {
    clusterManager: clusterManager.isLoading
      ? []
      : clusterManager.sharedIdentity,
    modelManager: modelManager.isLoading ? [] : modelManager.sharedIdentity,
  };
}

/**
 * Above every Model hosting view: why GPU node pools and model serving are
 * not offered on an installation whose muster has no per-user sign-in, in one
 * note for both managers.
 */
export function ModelHostingSharedIdentityNote() {
  const { clusterManager, modelManager } = useModelHostingSharedIdentity();
  if (clusterManager.length > 0 && modelManager.length > 0) {
    const installations = [...new Set([...clusterManager, ...modelManager])];
    return (
      <SharedIdentityNote
        installations={installations}
        blocked="Models cannot be hosted"
        via="GPU node pools and model serving are managed through cluster-manager and model-manager"
      />
    );
  }
  if (modelManager.length > 0) {
    return (
      <SharedIdentityNote
        installations={modelManager}
        blocked="Models cannot be served"
        via={MODEL_SERVING_VIA}
      />
    );
  }
  return (
    <SharedIdentityNote
      installations={clusterManager}
      blocked="GPU node pools cannot be managed"
      via={GPU_POOLS_VIA}
    />
  );
}
