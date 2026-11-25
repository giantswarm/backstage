import { useQuery } from '@tanstack/react-query';
import { musterInstallationsQueryKey } from '@giantswarm/backstage-plugin-muster';

import { originOf } from '../lib/urlElicitation';
import { useMusterPluginApi } from './useMusterPluginApi';

/**
 * The origin of the installation's muster, from the muster backend's
 * installation list (its aggregator endpoint, on the host muster serves its
 * own pages from: sign-in, approval). A URL elicitation's link on it gets a
 * return to the portal. `undefined` while unknown, without an installation,
 * and on a portal without the muster plugin: links then open as sent.
 */
export function useMusterOrigin(
  installation: string | undefined,
): string | undefined {
  const musterApi = useMusterPluginApi();
  const { data } = useQuery({
    // The muster plugin's own key, so the list is read once for the page
    // header's installation selector and this.
    queryKey: musterInstallationsQueryKey(),
    queryFn: () => musterApi!.listInstallations(),
    enabled: Boolean(musterApi && installation),
  });
  const endpoint = data?.installations.find(
    entry => entry.name === installation,
  )?.endpoint;
  return originOf(endpoint);
}
