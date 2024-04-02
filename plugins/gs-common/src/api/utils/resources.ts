import { Constants, Labels } from '../constants';
import type { Cluster } from '../types';
import { getAppGVK } from './apps';
import { getClusterGVK } from './clusters';
import { getHelmReleaseGVK } from './helmreleases';

export function getResourceAppName(resource: Cluster) {
  return resource.metadata.labels?.[Labels.labelApp];
}

/**
 * Determines whether a resource is imported.
 * @param resource
 */
export function isResourceImported(resource: Cluster) {
  return getResourceAppName(resource) === Constants.CAPI_IMPORTER_APP_NAME;
}

export function getResourceGVK(kind: string, apiVersion: string) {
  switch (kind) {
    case 'app':
      return getAppGVK(apiVersion);
    case 'cluster':
      return getClusterGVK(apiVersion);
    case 'helmrelease':
      return getHelmReleaseGVK(apiVersion);
    default:
      return undefined;
  }
}
