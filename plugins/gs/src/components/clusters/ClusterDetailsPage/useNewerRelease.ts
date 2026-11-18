import { useMemo } from 'react';
import {
  Release,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { semverCompareSort } from '@giantswarm/backstage-plugin-ui-react';
import { useCurrentCluster } from './useCurrentCluster';
import { getClusterReleaseProvider, getClusterReleaseVersion } from '../utils';

/** A release newer than the one a cluster runs: its version and when it came out. */
export type NewerRelease = { version: string; date?: string };

/**
 * The newest active release of `provider` among `releases` that is newer
 * than `current`. A Release is named `<provider>-<version>`; the version is
 * read off that name directly, since `Release.getVersion()` strips only the
 * prefixes it knows (not `eks-` or `cloud-director-`).
 */
export function newerReleaseOf(
  releases: readonly Release[],
  provider: string,
  current: string,
): NewerRelease | undefined {
  const prefix = `${provider}-`;
  // Built per call, so its parse cache lives with this list only.
  const newestFirst = semverCompareSort<string>(version => version, {
    descending: true,
  });
  const candidates = releases.flatMap(release => {
    const name = release.getName();
    if (!name.startsWith(prefix) || release.jsonData.spec?.state !== 'active') {
      return [];
    }
    return [
      {
        version: name.slice(prefix.length).replace(/^v/, ''),
        date: release.jsonData.spec?.date,
      },
    ];
  });
  const newest = candidates.sort((a, b) =>
    newestFirst(a.version, b.version),
  )[0];
  // Newest first sorts a newer version before the current one.
  return newest && newestFirst(newest.version, current) < 0
    ? newest
    : undefined;
}

/**
 * The newest active release of the current cluster's provider that is newer
 * than the one it runs, from the Release resources of its installation
 * (`release.giantswarm.io`, as the cluster creation form reads them).
 * Undefined while they load, where they cannot be read, and where the
 * cluster runs the newest.
 */
export function useNewerRelease(): NewerRelease | undefined {
  const { cluster, installationName } = useCurrentCluster();
  const current = getClusterReleaseVersion(cluster);
  const provider = getClusterReleaseProvider(cluster);
  const { resources } = useResources(installationName, Release, undefined, {
    enabled: Boolean(current && provider),
  });
  return useMemo(
    () =>
      current && provider
        ? newerReleaseOf(resources, provider, current)
        : undefined,
    [resources, provider, current],
  );
}
