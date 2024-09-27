import type { App } from '@giantswarm/backstage-plugin-gs-common';
import { appGVK } from '@giantswarm/backstage-plugin-gs-common';
import { useListResources } from './useListResources';

export function useApps() {
  return useListResources<App>(appGVK);
}
