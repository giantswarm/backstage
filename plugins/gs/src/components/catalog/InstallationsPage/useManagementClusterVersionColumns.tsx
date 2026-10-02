import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { TableColumn } from '@backstage/core-components';
import { CatalogTableRow } from '@backstage/plugin-catalog';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { Skeleton, Text } from '@backstage/ui';
import { UseQueryResult, useQueries } from '@tanstack/react-query';
import {
  Cluster,
  isNotFoundError,
  k8sResponseError,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { semverCompareSort } from '@giantswarm/backstage-plugin-ui-react';
import { useInstallations } from '../../../apis/installations';
import { describeClusterError } from '../../clusters/ClustersDataProvider/utils';
import { getClusterReleaseVersion } from '../../clusters/utils';
import { formatVersion } from '../../utils/helpers';
import { KubernetesVersion, Version } from '../../UI';

/** Where a management cluster's own `Cluster` resource lives. */
const MANAGEMENT_CLUSTER_NAMESPACE = 'org-giantswarm';

/** A version cell's state for one installation. */
export type VersionCell =
  | { state: 'loading' }
  | { state: 'known'; version: string }
  | { state: 'absent'; reason: string }
  | { state: 'failed'; reason: string };

export type ManagementClusterVersions = {
  kubernetes: VersionCell;
  release: VersionCell;
};

const NOT_CONNECTED: VersionCell = {
  state: 'absent',
  reason: 'This portal is not connected to the installation',
};
const NO_RELEASE: VersionCell = {
  state: 'absent',
  reason: 'The management cluster carries no Giant Swarm release',
};
const LOADING: VersionCell = { state: 'loading' };

function failed(error: Error): VersionCell {
  return {
    state: 'failed',
    reason:
      error.name === 'RejectedError'
        ? 'Not signed in to the installation'
        : describeClusterError(error),
  };
}

/** A `/version` query's cell; a stable `combine`, so it reruns only when a query changes. */
function serverVersionCells(
  queries: UseQueryResult<string, Error>[],
): VersionCell[] {
  return queries.map(query => {
    if (query.isSuccess) {
      return { state: 'known', version: query.data };
    }
    return query.isError ? failed(query.error) : LOADING;
  });
}

function versionOf(cell: VersionCell | undefined) {
  return cell?.state === 'known' ? cell.version : undefined;
}

/**
 * Each management cluster's versions, read live from the installation: the
 * Kubernetes version its API server serves (`/version`, so every
 * installation the portal is connected to has one) and the Giant Swarm
 * release on its own `Cluster` resource where it carries one. One request
 * per installation and kind; one slow or unreachable installation leaves
 * the others' cells alone.
 */
export function useManagementClusterVersions(): Record<
  string,
  ManagementClusterVersions
> {
  const kubernetesApi = useApi(kubernetesApiRef);
  const { installations } = useInstallations();
  const names = useMemo(
    () => installations.map(installation => installation.name),
    [installations],
  );

  const serverVersions = useQueries({
    queries: names.map(name => ({
      queryKey: ['cluster', name, 'version'],
      queryFn: async (): Promise<string> => {
        const response = await kubernetesApi.proxy({
          clusterName: name,
          path: '/version',
        });
        if (!response.ok) {
          throw await k8sResponseError(
            response,
            `Failed to fetch the Kubernetes version from ${name}`,
          );
        }
        const { gitVersion } = await response.json();
        return gitVersion;
      },
    })),
    combine: serverVersionCells,
  });

  const namespaces = useMemo(
    () =>
      Object.fromEntries(
        names.map(name => [name, { namespace: MANAGEMENT_CLUSTER_NAMESPACE }]),
      ),
    [names],
  );
  const { resources, clustersData, errors } = useResources(
    names,
    Cluster,
    namespaces,
  );

  return useMemo(() => {
    const result: Record<string, ManagementClusterVersions> = {};
    names.forEach((name, idx) => {
      const kubernetes = serverVersions[idx];

      // The release follows the API server: an installation that cannot be
      // reached says so once, in both cells, whatever its Cluster list did.
      let release: VersionCell;
      if (kubernetes.state === 'failed') {
        release = kubernetes;
      } else {
        const listed = clustersData.some(({ cluster }) => cluster === name);
        const listError = errors.find(({ cluster }) => cluster === name);
        if (listed) {
          const cluster = resources.find(
            item => item.cluster === name && item.getName() === name,
          );
          const releaseVersion = cluster
            ? getClusterReleaseVersion(cluster)
            : undefined;
          release = releaseVersion
            ? { state: 'known', version: releaseVersion }
            : NO_RELEASE;
        } else if (listError) {
          // No CAPI on the installation (the API is not served, or not in
          // a version the plugin reads) means no release, not a failure.
          release =
            listError.type === 'incompatibility' || isNotFoundError(listError)
              ? NO_RELEASE
              : failed(listError.error);
        } else {
          release = LOADING;
        }
      }

      result[name] = { kubernetes, release };
    });
    return result;
  }, [names, serverVersions, resources, clustersData, errors]);
}

function CellState({
  cell,
  testId,
  children,
}: {
  cell: VersionCell | undefined;
  testId: string;
  children: (version: string) => JSX.Element;
}) {
  const shown = cell ?? NOT_CONNECTED;
  switch (shown.state) {
    case 'loading':
      return (
        <span data-testid={`${testId}-loading`} aria-label="Loading">
          <Skeleton width={64} height={16} />
        </span>
      );
    case 'known':
      return <span data-testid={testId}>{children(shown.version)}</span>;
    case 'absent':
      // The dash says "no value" at a glance; the hover and the screen
      // reader say why.
      return (
        <Text
          as="span"
          data-testid={testId}
          title={shown.reason}
          aria-label={shown.reason}
        >
          —
        </Text>
      );
    case 'failed':
    default:
      return (
        <Text
          as="span"
          color="secondary"
          data-testid={testId}
          title={shown.reason}
        >
          {shown.reason}
        </Text>
      );
  }
}

function versionColumn(
  title: string,
  key: keyof ManagementClusterVersions,
  versions: Record<string, ManagementClusterVersions>,
  renderVersion: (version: string) => JSX.Element,
): TableColumn<CatalogTableRow> {
  const valueOf = ({ entity }: CatalogTableRow) =>
    versionOf(versions[entity.metadata.name]?.[key]);

  return {
    title,
    field: `managementClusterVersions.${key}`,
    width: 'auto',
    cellStyle: { whiteSpace: 'nowrap' },
    customSort: semverCompareSort(valueOf),
    customFilterAndSearch(query: string, row) {
      return (valueOf(row) ?? '')
        .toLocaleLowerCase('en-US')
        .includes(query.toLocaleLowerCase('en-US'));
    },
    render: row => {
      const name = row.entity.metadata.name;
      return (
        <CellState
          cell={versions[name]?.[key]}
          testId={`version-${key}-${name}`}
        >
          {renderVersion}
        </CellState>
      );
    },
  };
}

/**
 * The Installations page's version columns: the Kubernetes version of each
 * installation's management cluster (end of life marked) and its Giant Swarm
 * release, sortable in semver order and matched by the table search.
 */
export function useManagementClusterVersionColumns(): TableColumn<CatalogTableRow>[] {
  const versions = useManagementClusterVersions();

  return useMemo(
    () => [
      versionColumn('Kubernetes version', 'kubernetes', versions, version => (
        <KubernetesVersion
          version={formatVersion(version)}
          hidePatchVersion={false}
          hideIcon
          hideLabel
        />
      )),
      versionColumn('Release', 'release', versions, version => (
        <Version version={version} highlight />
      )),
    ],
    [versions],
  );
}
