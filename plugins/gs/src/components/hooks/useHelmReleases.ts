import type { HelmRelease } from '@giantswarm/backstage-plugin-gs-common';
import { helmReleaseGVK } from '@giantswarm/backstage-plugin-gs-common';
import { useListResources } from './useListResources';

export function useHelmReleases() {
  return useListResources<HelmRelease>(helmReleaseGVK);
}
