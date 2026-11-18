import {
  hasServingLayer,
  type ServingContextValue,
} from '../components/ServingProvider';
import { useClusterManagerAvailability } from './useClusterManager';
import type { MusterServerAvailability } from '@giantswarm/backstage-plugin-muster';

export type ModelHosting = {
  /**
   * Model hosting has something to show for the environments in view: a
   * serving layer, or cluster-manager reachable as the person.
   */
  available: boolean;
  /**
   * Not available yet, and an answer that could make it so is still being
   * read: the serving layer or cluster-manager's server lists.
   */
  isLoading: boolean;
  /** model-manager or KServe answers (or could not be asked) in view. */
  servingLayer: boolean;
  /**
   * cluster-manager on the reachable installations in view. `available`
   * lists those whose muster offers it as the person; one running under
   * muster's shared identity is not among them, as its tools are refused.
   */
  clusterManager: MusterServerAvailability;
};

/**
 * Whether Model hosting is offered: the one predicate its entry on Customize
 * → Models, the hint that stands in for that entry, and the hosting page's
 * tab strip share, so the way in and the frame agree. A serving layer offers
 * Running models; cluster-manager alone offers GPU pools and Model cache,
 * which stand without one. Pass `undefined` outside a `ServingProvider`:
 * hosting is then not offered. Needs the plugin's QueryClientProvider.
 */
export function useModelHosting(
  serving: ServingContextValue | undefined,
): ModelHosting {
  const clusterManager = useClusterManagerAvailability(
    serving?.reachableInstallations ?? [],
  );
  const servingLayer = Boolean(serving && hasServingLayer(serving));
  const available = servingLayer || clusterManager.available.length > 0;
  return {
    available,
    isLoading:
      !available && Boolean(serving?.isLoading || clusterManager.isLoading),
    servingLayer,
    clusterManager,
  };
}
