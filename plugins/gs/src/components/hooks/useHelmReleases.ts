import type { HelmRelease } from '@internal/plugin-gs-common';
import { helmReleaseGVK } from '@internal/plugin-gs-common';
import { useListResources } from './useListResources';

export function useHelmReleases() {
  return useListResources<HelmRelease>(helmReleaseGVK);
}
