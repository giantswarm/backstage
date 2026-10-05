import { useMemo } from 'react';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { TableColumn } from '@backstage/core-components';
import { CatalogTableRow } from '@backstage/plugin-catalog';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { Skeleton, Text } from '@backstage/ui';
import { UseQueryResult, useQueries, useQuery } from '@tanstack/react-query';
import {
  ManagementClusterVersionCell,
  ManagementClusterVersionsResponse,
  SUBJECT_TOKEN_HEADER,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  Cluster,
  isNotFoundError,
  k8sResponseError,
  NON_PERSISTED_QUERY_META,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { semverCompareSort } from '@giantswarm/backstage-plugin-ui-react';
import { gsAuthProvidersApiRef } from '../../../apis/auth';
import { useInstallations } from '../../../apis/installations';
import { getClusterReleaseVersion } from '../../clusters/utils';
import { formatVersion } from '../../utils/helpers';
import { KubernetesVersion, Version } from '../../UI';

/** Where a management cluster's own `Cluster` resource lives. */
const MANAGEMENT_CLUSTER_NAMESPACE = 'org-giantswarm';

/** A version cell's state for one installation. */
export type VersionCell = { state: 'loading' } | ManagementClusterVersionCell;

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
const LOADING_CELL: VersionCell = { state: 'loading' };
const LOADING: ManagementClusterVersions = {
  kubernetes: LOADING_CELL,
  release: LOADING_CELL,
};

/**
 * A failed read's cell: a short status that fits the column, the error's own
 * text on hover. A declined or failed main sign-in (`RejectedError`) means
 * not signed in.
 */
function failed(error: Error): VersionCell {
  if (error.name === 'RejectedError') {
    return {
      state: 'failed',
      reason: 'Not signed in',
      detail: 'Not signed in to the installation: sign in to the portal again',
    };
  }
  if (error.name === 'TimeoutError' || /timed out/i.test(error.message)) {
    return { state: 'failed', reason: 'Timed out', detail: error.message };
  }
  if (error.name === 'ForbiddenError') {
    return {
      state: 'failed',
      reason: 'Access forbidden',
      detail: error.message,
    };
  }
  if (error.name === 'NotFoundError') {
    return { state: 'failed', reason: 'API not found', detail: error.message };
  }
  return { state: 'failed', reason: 'Read failed', detail: error.message };
}

function versionOf(cell: VersionCell | undefined) {
  return cell?.state === 'known' ? cell.version : undefined;
}

/** A `/version` query's cell; a stable `combine`, so it reruns only when a query changes. */
function serverVersionCells(
  queries: UseQueryResult<string, Error>[],
): VersionCell[] {
  return queries.map(query => {
    if (query.isSuccess) {
      return { state: 'known', version: query.data };
    }
    return query.isError ? failed(query.error) : LOADING_CELL;
  });
}

/**
 * The versions of the installations only the browser can read as the person
 * (their own OIDC sign-in, or a `backendUrl` override), one request per
 * installation and kind through the Kubernetes plugin's client, as before
 * the backend read the others.
 */
function useBrowserReadVersions(
  names: string[],
): Record<string, ManagementClusterVersions> {
  const kubernetesApi = useApi(kubernetesApiRef);

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
      meta: { ...NON_PERSISTED_QUERY_META },
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
          release = LOADING_CELL;
        }
      }

      result[name] = { kubernetes, release };
    });
    return result;
  }, [names, serverVersions, resources, clustersData, errors]);
}

const NONE: string[] = [];

/**
 * Each management cluster's versions, read live from the installations as
 * the signed-in person: the Kubernetes version its API server serves and the
 * Giant Swarm release on its own `Cluster` resource where it carries one.
 * The backend reads every installation it can read as the person in one
 * request (`GET /api/gs/installations/versions`) and keeps each answer for a
 * few minutes; the installations it names as `readInBrowser` are read from
 * the browser. The answer is the signed-in person's (their versions, their
 * "Access forbidden"), so it is never persisted to the browser's storage,
 * where the next person to sign in on the same browser would see it.
 */
export function useManagementClusterVersions(): Record<
  string,
  ManagementClusterVersions
> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const gsAuthProvidersApi = useApi(gsAuthProvidersApiRef);
  const { installations } = useInstallations();

  const query = useQuery({
    queryKey: ['installations', 'management-cluster-versions'],
    queryFn: async (): Promise<ManagementClusterVersionsResponse> => {
      const [idToken, baseUrl] = await Promise.all([
        gsAuthProvidersApi.getMainAuthApi().getIdToken(),
        discoveryApi.getBaseUrl('gs'),
      ]);
      const response = await fetchApi.fetch(
        `${baseUrl}/installations/versions`,
        { headers: { [SUBJECT_TOKEN_HEADER]: idToken } },
      );
      if (!response.ok) {
        const error = new Error(
          `The portal could not read the management cluster versions (HTTP ${response.status})`,
        );
        if (response.status === 403) {
          error.name = 'ForbiddenError';
        }
        throw error;
      }
      return response.json();
    },
    meta: { ...NON_PERSISTED_QUERY_META },
  });

  const browserVersions = useBrowserReadVersions(
    query.data?.readInBrowser ?? NONE,
  );

  return useMemo(() => {
    const result: Record<string, ManagementClusterVersions> = {};
    for (const { name } of installations) {
      if (query.data) {
        const versions =
          query.data.installations[name] ?? browserVersions[name];
        if (versions) {
          result[name] = versions;
        }
      } else if (query.isError) {
        const cell = failed(query.error);
        result[name] = { kubernetes: cell, release: cell };
      } else {
        result[name] = LOADING;
      }
    }
    return result;
  }, [installations, query.data, query.isError, query.error, browserVersions]);
}

/** Keeps a failed cell within its column: an ellipsis past the width. */
const FAILED_STYLE = {
  display: 'inline-block',
  maxWidth: '16em',
  verticalAlign: 'bottom',
} as const;

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
      // A short status that fits the column; the full reason on hover.
      return (
        <Text
          as="span"
          color="secondary"
          truncate
          style={FAILED_STYLE}
          data-testid={testId}
          title={shown.detail ?? shown.reason}
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
