import { Constants, Labels } from '../constants';
import type { Cluster } from '../types';

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
