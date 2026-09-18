import { useApiHolder } from '@backstage/core-plugin-api';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

/**
 * The muster plugin's API, or `undefined` when that plugin is not installed in
 * this app. marge is reachable only through it, so the page says so instead of
 * throwing, which `useApi` would on an unbound ref.
 */
export function useMusterPluginApi(): MusterApi | undefined {
  return useApiHolder().get(musterApiRef);
}
