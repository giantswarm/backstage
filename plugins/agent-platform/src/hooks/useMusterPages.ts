import { useQuery } from '@tanstack/react-query';
import { musterInstallationsQueryKey } from '@giantswarm/backstage-plugin-muster';

import { musterPagesOf, type MusterPages } from '../lib/urlElicitation';
import { useMusterPluginApi } from './useMusterPluginApi';

/**
 * Where the installation's muster serves its own pages (sign-in, approval),
 * from the muster backend's installation list: the installation's configured
 * `publicUrl` (muster's `aggregator.oauth.mcpClient.publicUrl`, for a muster
 * whose pages are not on its endpoint's host), else its aggregator endpoint's
 * host.
 * A URL elicitation's link to one of those pages gets a return to the portal.
 * `undefined` while unknown, without an installation, and on a portal
 * without the muster plugin: links then open as sent.
 */
export function useMusterPages(
  installation: string | undefined,
): MusterPages | undefined {
  const musterApi = useMusterPluginApi();
  const { data } = useQuery({
    // The muster plugin's own key, so the list is read once for the page
    // header's installation selector and this.
    queryKey: musterInstallationsQueryKey(),
    queryFn: () => musterApi!.listInstallations(),
    enabled: Boolean(musterApi && installation),
  });
  const entry = data?.installations.find(i => i.name === installation);
  return musterPagesOf(entry?.publicUrl ?? entry?.endpoint);
}
