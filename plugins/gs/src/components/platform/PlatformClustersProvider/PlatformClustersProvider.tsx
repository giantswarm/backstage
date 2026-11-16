import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import {
  ErrorsProvider,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  type RouteTabCount,
  useTableColumns,
} from '@giantswarm/backstage-plugin-ui-react';
import { useMainSessionEnd } from '../../../apis/auth/mainSessionEnd';
import { useMutedInstallations } from '../../../apis/mutedInstallations';
import { useDisabledInstallations } from '../../hooks/useDisabledInstallations';
import {
  ClustersDataProvider,
  useClustersData,
} from '../../clusters/ClustersDataProvider';
import { QueryClientProvider } from '../../QueryClientProvider';
import {
  dataColumnsOf,
  type PlatformClusterColumn,
  visibleColumnsOf,
} from '../PlatformClustersPanel/platformClusterColumns';

/** Where the list keeps a person's columns, per browser. */
export const PLATFORM_CLUSTERS_TABLE_ID = 'platform-clusters';

/**
 * What the list can say about its clusters as a whole:
 * - `loading`: no answer yet;
 * - `session-ended`: the portal session ended, so nothing can be read;
 * - `installations-failed`: the list of environments could not be read;
 * - `no-installations`: no environment is configured or switched on;
 * - `failed`: no cluster to show and an environment could not be read;
 * - `empty`: every environment answered, and none has a cluster;
 * - `ready`: there are clusters to show.
 */
export type PlatformClustersStatus =
  | 'loading'
  | 'session-ended'
  | 'installations-failed'
  | 'no-installations'
  | 'failed'
  | 'empty'
  | 'ready';

type PlatformClustersState = {
  status: PlatformClustersStatus;
  /** Why the list of environments could not be read, in `installations-failed`. */
  installationsError?: Error;
  /** Reads the list of environments again. */
  retryInstallations: () => void;
  visibleColumns: PlatformClusterColumn[];
  setVisibleColumns: (columns: string[]) => void;
};

const PlatformClustersContext = createContext<
  PlatformClustersState | undefined
>(undefined);

export function usePlatformClustersState(): PlatformClustersState {
  const value = useContext(PlatformClustersContext);
  if (!value) {
    throw new Error(
      'usePlatformClustersState must be used inside a PlatformClustersProvider',
    );
  }
  return value;
}

type Scope = {
  installations: string[];
  isResolving: boolean;
  error?: Error;
  retry: () => void;
};

/**
 * Every installation the person can reach, as the classic list reads with
 * all of them picked: the ones whose backend is down and the ones the person
 * switched off app-wide are left out.
 */
function useInstallationScope(): Scope {
  const { clusters, isLoading, error, retry } = useClustersInfo();
  const { disabledInstallations, isLoading: isLoadingDisabled } =
    useDisabledInstallations();
  const muted = useMutedInstallations();
  const installations = useMemo(() => {
    const skipped = new Set([...disabledInstallations, ...muted]);
    return clusters.filter(cluster => !skipped.has(cluster));
  }, [clusters, disabledInstallations, muted]);
  const retryInstallations = useCallback(() => {
    retry();
  }, [retry]);
  return {
    installations,
    isResolving: isLoading || isLoadingDisabled,
    error: error ?? undefined,
    retry: retryInstallations,
  };
}

function PlatformClustersState({
  scope,
  visibleColumns,
  setVisibleColumns,
  children,
}: {
  scope: Scope;
  visibleColumns: PlatformClusterColumn[];
  setVisibleColumns: (columns: string[]) => void;
  children: ReactNode;
}) {
  const {
    data,
    isReadingClusters,
    answeredInstallations,
    unlistedInstallations,
  } = useClustersData();
  const sessionEnd = useMainSessionEnd();

  let status: PlatformClustersStatus;
  if (data.length > 0) {
    status = 'ready';
  } else if (sessionEnd) {
    status = 'session-ended';
  } else if (scope.error) {
    status = 'installations-failed';
  } else if (scope.isResolving) {
    status = 'loading';
  } else if (scope.installations.length === 0) {
    status = 'no-installations';
  } else if (isReadingClusters) {
    status = 'loading';
  } else if (unlistedInstallations.length > 0) {
    status = 'failed';
  } else if (answeredInstallations.length > 0) {
    status = 'empty';
  } else {
    // Nothing answered and nothing failed: the reads have not started yet.
    status = 'loading';
  }

  const value = useMemo(
    () => ({
      status,
      installationsError: scope.error,
      retryInstallations: scope.retry,
      visibleColumns,
      setVisibleColumns,
    }),
    [status, scope.error, scope.retry, visibleColumns, setVisibleColumns],
  );

  return (
    <PlatformClustersContext.Provider value={value}>
      {children}
    </PlatformClustersContext.Provider>
  );
}

function PlatformClustersScope({ children }: { children: ReactNode }) {
  const scope = useInstallationScope();
  const { visibleColumns: saved, saveVisibleColumns } = useTableColumns(
    PLATFORM_CLUSTERS_TABLE_ID,
  );
  const visibleColumns = useMemo(() => visibleColumnsOf(saved), [saved]);
  const dataColumns = useMemo(
    () => dataColumnsOf(visibleColumns),
    [visibleColumns],
  );
  const setVisibleColumns = useCallback(
    (columns: string[]) => saveVisibleColumns(['name', ...columns]),
    [saveVisibleColumns],
  );

  return (
    // The installations and columns go in as props, so the provider reads
    // them from its first render: an effect would leave one commit with no
    // installation and nothing loading, which read as "no clusters".
    <ClustersDataProvider
      installations={scope.isResolving ? [] : scope.installations}
      columns={dataColumns}
    >
      <PlatformClustersState
        scope={scope}
        visibleColumns={visibleColumns}
        setVisibleColumns={setVisibleColumns}
      >
        {children}
      </PlatformClustersState>
    </ClustersDataProvider>
  );
}

/**
 * The data of the shell's clusters list, for the Platform page to mount above
 * its tabs, so the Clusters tab's count and its list read once: the classic
 * list's provider (`ClustersDataProvider`) over every reachable installation.
 * The list names its failed reads itself (`unlistedInstallations`,
 * `relatedReadFailures`), so the classic error boxes are not drawn.
 */
export function PlatformClustersProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <QueryClientProvider>
      <ErrorsProvider ignoreError={hideClassicErrors}>
        <PlatformClustersScope>{children}</PlatformClustersScope>
      </ErrorsProvider>
    </QueryClientProvider>
  );
}

function hideClassicErrors(): boolean {
  return true;
}

/**
 * The Clusters tab's count: `'loading'` until the list has its answer, the
 * number of clusters once it has, and left out where 0 would claim there are
 * none although they could not be read.
 */
export function usePlatformClustersCount(): RouteTabCount | undefined {
  const { data } = useClustersData();
  const { status } = usePlatformClustersState();
  switch (status) {
    case 'loading':
      return 'loading';
    case 'ready':
    case 'empty':
    case 'no-installations':
      return data.length;
    default:
      return undefined;
  }
}
