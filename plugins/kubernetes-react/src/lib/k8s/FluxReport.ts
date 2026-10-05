import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type FluxReportInterface = crds.fluxoperator.v1.FluxReport;

/**
 * The Flux Operator's report on the Flux installation of a cluster. The
 * operator writes it, spec included, and regenerates it periodically.
 */
export class FluxReport extends FluxObject<FluxReportInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly group = 'fluxcd.controlplane.io';
  static readonly kind = 'FluxReport' as const;
  static readonly plural = 'fluxreports';

  getDistribution() {
    return this.jsonData.spec?.distribution;
  }

  getOperator() {
    return this.jsonData.spec?.operator;
  }

  getClusterInfo() {
    return this.jsonData.spec?.cluster;
  }

  getComponents() {
    return this.jsonData.spec?.components;
  }

  /**
   * Per Flux kind, how many objects are running, failing and suspended.
   */
  getReconcilers() {
    return this.jsonData.spec?.reconcilers;
  }

  getSync() {
    return this.jsonData.spec?.sync;
  }
}
