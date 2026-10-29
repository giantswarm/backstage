import { crds } from '@giantswarm/k8s-types';
import { FluxOperatorObject } from './FluxOperatorObject';

type ResourceSetInputProviderInterface =
  crds.fluxoperator.v1.ResourceSetInputProvider;

/**
 * A source of inputs for ResourceSets, such as the open pull requests of a
 * repository or the tags of an OCI artifact.
 */
export class ResourceSetInputProvider extends FluxOperatorObject<ResourceSetInputProviderInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly group = 'fluxcd.controlplane.io';
  static readonly kind = 'ResourceSetInputProvider' as const;
  static readonly plural = 'resourcesetinputproviders';

  getType() {
    return this.jsonData.spec?.type;
  }

  getURL() {
    return this.jsonData.spec?.url;
  }

  getFilter() {
    return this.jsonData.spec?.filter;
  }

  getSchedule() {
    return this.jsonData.spec?.schedule;
  }

  getExportedInputs() {
    return this.jsonData.status?.exportedInputs;
  }

  getLastExportedRevision() {
    return this.jsonData.status?.lastExportedRevision;
  }

  getNextSchedule() {
    return this.jsonData.status?.nextSchedule;
  }
}
