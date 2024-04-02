import type { App } from '@internal/plugin-gs-common';
import { appGVK } from '@internal/plugin-gs-common';
import { useListResources } from './useListResources';

export function useApps() {
  return useListResources<App>(appGVK);
}
