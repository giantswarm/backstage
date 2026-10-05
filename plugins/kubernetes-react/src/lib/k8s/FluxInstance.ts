import { crds } from '@giantswarm/k8s-types';
import { FluxOperatorObject } from './FluxOperatorObject';

type FluxInstanceInterface = crds.fluxoperator.v1.FluxInstance;

/**
 * A Flux installation managed by the Flux Operator.
 */
export class FluxInstance extends FluxOperatorObject<FluxInstanceInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly group = 'fluxcd.controlplane.io';
  static readonly kind = 'FluxInstance' as const;
  static readonly plural = 'fluxinstances';

  getDistribution() {
    return this.jsonData.spec?.distribution;
  }

  getComponents() {
    return this.jsonData.spec?.components;
  }

  getClusterConfig() {
    return this.jsonData.spec?.cluster;
  }

  /**
   * The Flux source and Kustomization the operator creates to sync the
   * cluster from, if any.
   */
  getSync() {
    return this.jsonData.spec?.sync;
  }

  /**
   * The components as installed: name, image repository, tag and digest.
   */
  getInstalledComponents() {
    return this.jsonData.status?.components;
  }

  getInventory() {
    return this.jsonData.status?.inventory;
  }

  getLastAppliedRevision() {
    return this.jsonData.status?.lastAppliedRevision;
  }

  getLastAttemptedRevision() {
    return this.jsonData.status?.lastAttemptedRevision;
  }
}
