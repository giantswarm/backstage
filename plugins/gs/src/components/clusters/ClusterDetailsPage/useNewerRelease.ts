import {
  Release,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { semverCompareSort } from '@giantswarm/backstage-plugin-ui-react';
import { useCurrentCluster } from './useCurrentCluster';
import { getClusterAppName, getClusterReleaseVersion } from '../utils';

/** A release newer than the one a cluster runs: its version and when it came out. */
export type NewerRelease = { version: string; date?: string };

const newestFirst = semverCompareSort<string>(version => version, {
  descending: true,
});

/**
 * The newest active release of the current cluster's provider that is newer
 * than the one it runs, from the Release resources of its installation
 * (`release.giantswarm.io`, named `<provider>-<version>`, as the cluster
 * creation form reads them). Undefined while they load, where they cannot be
 * read, and where the cluster runs the newest.
 */
export function useNewerRelease(): NewerRelease | undefined {
  const { cluster, installationName } = useCurrentCluster();
  const current = getClusterReleaseVersion(cluster);
  const provider = getClusterAppName(cluster)?.match(/^cluster-(.+)$/)?.[1];
  const { resources } = useResources(installationName, Release, undefined, {
    enabled: Boolean(current && provider),
  });
  if (!current || !provider) {
    return undefined;
  }
  const newest = resources
    .filter(
      release =>
        release.getName().startsWith(`${provider}-`) &&
        release.jsonData.spec?.state === 'active',
    )
    .sort((a, b) => newestFirst(a.getVersion(), b.getVersion()))[0];
  // Newest first sorts a newer version before the current one.
  return newest && newestFirst(newest.getVersion(), current) < 0
    ? { version: newest.getVersion(), date: newest.jsonData.spec?.date }
    : undefined;
}
