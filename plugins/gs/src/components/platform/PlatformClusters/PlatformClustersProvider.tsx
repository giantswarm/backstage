import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
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
} from './platformClusterColumns';

/** Where the list keeps a person's columns, per browser. */
export const PLATFORM_CLUSTERS_TABLE_ID = 'platform-clusters';

type PlatformClustersState = {
  /** Whether the installations to read are still being worked out. */
  isResolvingInstallations: boolean;
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

/**
 * Reads every installation the person can reach, as the classic list does
 * with all of them picked: the ones whose backend is down and the ones the
 * person switched off app-wide are left out. Tells the data provider which
 * columns show, so it reads only what they need.
 */
function PlatformClustersScope({ children }: { children: ReactNode }) {
  const { setActiveInstallations, setVisibleColumns: setDataColumns } =
    useClustersData();
  const { clusters, isLoading } = useClustersInfo();
  const { disabledInstallations, isLoading: isLoadingDisabled } =
    useDisabledInstallations();
  const muted = useMutedInstallations();
  const isResolvingInstallations = isLoading || isLoadingDisabled;

  const installations = useMemo(() => {
    const skipped = new Set([...disabledInstallations, ...muted]);
    return clusters.filter(cluster => !skipped.has(cluster));
  }, [clusters, disabledInstallations, muted]);
  const installationsKey = installations.join(',');

  useEffect(() => {
    if (!isResolvingInstallations) {
      setActiveInstallations(
        installationsKey ? installationsKey.split(',') : [],
      );
    }
  }, [installationsKey, isResolvingInstallations, setActiveInstallations]);

  const { visibleColumns: saved, saveVisibleColumns } = useTableColumns(
    PLATFORM_CLUSTERS_TABLE_ID,
  );
  const visibleColumns = useMemo(() => visibleColumnsOf(saved), [saved]);
  const visibleKey = visibleColumns.join(',');

  useEffect(() => {
    setDataColumns(dataColumnsOf(visibleKey.split(',')));
  }, [visibleKey, setDataColumns]);

  const setVisibleColumns = useCallback(
    (columns: string[]) => saveVisibleColumns(['name', ...columns]),
    [saveVisibleColumns],
  );

  const value = useMemo(
    () => ({ isResolvingInstallations, visibleColumns, setVisibleColumns }),
    [isResolvingInstallations, visibleColumns, setVisibleColumns],
  );

  return (
    <PlatformClustersContext.Provider value={value}>
      {children}
    </PlatformClustersContext.Provider>
  );
}

/**
 * The data of the shell's clusters list, for the Platform page to mount above
 * its tabs, so the Clusters tab's count and its list read once: the classic
 * list's provider (`ClustersDataProvider`) over every reachable installation.
 * Failures to read an installation are the list's to name
 * (`unlistedInstallations`), so the classic error boxes are not drawn.
 */
export function PlatformClustersProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <QueryClientProvider>
      <ErrorsProvider ignoreError={hideClassicErrors}>
        <ClustersDataProvider>
          <PlatformClustersScope>{children}</PlatformClustersScope>
        </ClustersDataProvider>
      </ErrorsProvider>
    </QueryClientProvider>
  );
}

function hideClassicErrors(): boolean {
  return true;
}

/** Whether the list is still waiting for its first clusters. */
export function usePlatformClustersLoading(): boolean {
  const { isLoading } = useClustersData();
  const { isResolvingInstallations } = usePlatformClustersState();
  return isResolvingInstallations || isLoading;
}

/**
 * The Clusters tab's count: `'loading'` until the first clusters are read,
 * and left out when no environment could be read, where 0 would claim there
 * are none.
 */
export function usePlatformClustersCount(): RouteTabCount | undefined {
  const { data, unlistedInstallations } = useClustersData();
  const isLoading = usePlatformClustersLoading();
  if (isLoading) {
    return 'loading';
  }
  if (data.length === 0 && unlistedInstallations.length > 0) {
    return undefined;
  }
  return data.length;
}
