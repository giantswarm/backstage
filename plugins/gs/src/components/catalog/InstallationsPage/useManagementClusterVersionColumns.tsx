import { useMemo } from 'react';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { TableColumn } from '@backstage/core-components';
import { CatalogTableRow } from '@backstage/plugin-catalog';
import { Skeleton, Text } from '@backstage/ui';
import { useQuery } from '@tanstack/react-query';
import { semverCompareSort } from '@giantswarm/backstage-plugin-ui-react';
import { gsAuthProvidersApiRef } from '../../../apis/auth';
import { useInstallations } from '../../../apis/installations';
import { describeClusterError } from '../../clusters/ClustersDataProvider/utils';
import { formatVersion } from '../../utils/helpers';
import { KubernetesVersion, Version } from '../../UI';

/** The header the backend reads the main Dex ID token from. */
const SUBJECT_TOKEN_HEADER = 'gs-subject-token';

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
const LOADING: ManagementClusterVersions = {
  kubernetes: { state: 'loading' },
  release: { state: 'loading' },
};

function versionOf(cell: VersionCell | undefined) {
  return cell?.state === 'known' ? cell.version : undefined;
}

/**
 * Each management cluster's versions, read live from the installations as
 * the signed-in person in one request (`GET /api/gs/installations/versions`):
 * the Kubernetes version its API server serves and the Giant Swarm release
 * on its own `Cluster` resource where it carries one. The backend asks every
 * installation at once and keeps each answer for a few minutes; the last
 * answer is kept in the browser too, so a revisit shows it at once and
 * refreshes it in the background.
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
    queryFn: async (): Promise<Record<string, ManagementClusterVersions>> => {
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
          `Failed to read the management cluster versions (HTTP ${response.status})`,
        );
        if (response.status === 403) {
          error.name = 'ForbiddenError';
        }
        throw error;
      }
      return (await response.json()).installations;
    },
  });

  return useMemo(() => {
    const result: Record<string, ManagementClusterVersions> = {};
    for (const { name } of installations) {
      if (query.data) {
        const versions = query.data[name];
        if (versions) {
          result[name] = versions;
        }
      } else if (query.isError) {
        const cell: VersionCell = {
          state: 'failed',
          reason: describeClusterError(query.error),
        };
        result[name] = { kubernetes: cell, release: cell };
      } else {
        result[name] = LOADING;
      }
    }
    return result;
  }, [installations, query.data, query.isError, query.error]);
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
