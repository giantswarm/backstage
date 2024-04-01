import { getAppGVK } from './apps';
import { getHelmReleaseGVK } from './helmreleases';

export function getDeploymentGVK(kind: string, apiVersion: string) {
  switch (kind) {
    case 'app':
      return getAppGVK(apiVersion);
    case 'helmrelease':
      return getHelmReleaseGVK(apiVersion);
    default:
      return undefined;
  }
}
