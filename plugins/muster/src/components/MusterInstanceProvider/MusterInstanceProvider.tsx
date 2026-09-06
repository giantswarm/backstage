import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { useInstallationInventory } from '@giantswarm/backstage-plugin-gs';
import {
  useResources,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { MCPServer, MusterWorkflow } from '../../lib/k8s';
import { musterApiRef } from '../../apis';
import { MusterInstallationInfo } from '../../apis/types';
import { selectMusterInstallations } from './selectInstallations';

const STORAGE_KEY = 'muster-installation';

// A light background refetch so the live health reads (per-MC pills, the
// "Servers healthy" stat, fleet coverage) don't drift silently from the CRD
// between page loads. Configured once here so both the dashboard and the
// MCP-servers manager inherit it (ADR D4). The reads are trivially cheap once
// the cluster auth is warm; the manual refresh control covers the gap between
// intervals.
const HEALTH_REFETCH_INTERVAL_MS = 30_000;

// The backend's `/installations` carries each muster's reachability from an
// unauthenticated probe that may not have settled when the list is first read
// (a pod that just started answers 'unknown'). Re-read every few seconds until
// every entry is settled, then leave the list alone: a list pinned at 'unknown'
// would run the session probe against a muster the portal cannot reach.
const INSTALLATIONS_REFETCH_WHILE_UNKNOWN_MS = 5_000;

/** Whether any installation's reachability has not been probed yet. */
export function hasUnknownReachability(
  installations: MusterInstallationInfo[] | undefined,
): boolean {
  return Boolean(
    installations?.some(installation => installation.reachable === 'unknown'),
  );
}

export type MusterInstance = {
  /**
   * The muster installations the picker may offer, home first: the backend's
   * installations (an endpoint the proxy can target, derived from the base
   * domain or configured) intersected with the installations whose inventory
   * has the `muster.giantswarm.io` API group -- see `selectMusterInstallations`.
   * An installation without a muster never appears here.
   */
  installations: string[];
  /** The same installations with the backend's endpoint, auth and reachability. */
  installationInfos: MusterInstallationInfo[];
  /**
   * True while the backend's list or the inventory's home installation has not
   * answered yet; the picker stays hidden and no default is written back.
   */
  isLoadingInstallations: boolean;
  /** The single active muster instance every screen is scoped to. */
  activeInstallation: string | undefined;
  /**
   * Config-derived metadata (endpoint, auth/mutation posture) for the active
   * instance, plus the backend's `reachable` / `reason` from its
   * unauthenticated probe -- `useMusterSession` reads it to skip the session
   * probe for a muster the portal cannot reach.
   */
  activeInstallationInfo: MusterInstallationInfo | undefined;
  setActiveInstallation: (installation: string) => void;
  /** MCPServer CRs of the active instance (one installation, not fan-out). */
  mcpServers: MCPServer[];
  /** Workflow CRs of the active instance. */
  workflows: MusterWorkflow[];
  isLoading: boolean;
  /** Epoch-ms of the most recent successful CRD read, or undefined while cold. */
  dataUpdatedAt: number | undefined;
  /** Whether a (background or manual) health refetch is currently in flight. */
  isRefreshing: boolean;
  /** Re-fetch the live CRD reads on demand (manual refresh / error retry). */
  retry: () => void;
};

/**
 * Exported for hooks that must degrade gracefully outside the provider
 * (see useMusterMutationRefresh) and for tests; components should use
 * {@link useMusterInstance}.
 */
export const MusterInstanceContext = createContext<MusterInstance | undefined>(
  undefined,
);

export function useMusterInstance(): MusterInstance {
  const value = useContext(MusterInstanceContext);
  if (!value) {
    throw new Error('MusterInstanceContext not available');
  }
  return value;
}

/**
 * Resolves the default active installation. Preference order: an explicit
 * choice (URL/localStorage) if it is a real muster installation, then the
 * muster on the *current* cluster (matched by a host segment, e.g.
 * `devportal.gazelle.…` -> gazelle), then the first installation.
 *
 * ponytail: "current cluster" is approximated by a host-segment match rather
 * than a dedicated config key -- good enough for the deployed devportal and
 * harmless locally (falls through to the first installation). Upgrade path:
 * a `muster.currentInstallation` config if the heuristic ever misfires.
 */
function resolveActive(
  installations: string[],
  preferred: string | null,
): string | undefined {
  if (installations.length === 0) {
    return undefined;
  }
  if (preferred && installations.includes(preferred)) {
    return preferred;
  }
  const host = typeof window !== 'undefined' ? window.location.host : '';
  const hostSegments = host.split(/[.:]/);
  const local = installations.find(name => hostSegments.includes(name));
  return local ?? installations[0];
}

type MusterInstanceProviderProps = {
  children: ReactNode;
};

/**
 * Holds the single active muster instance and the muster-only installation
 * list, replacing the old multi-select MusterDataProvider. The active
 * instance is persisted via the `?installation=` URL param + localStorage so
 * deep links and refreshes keep it. CRD reads (MCPServer, Workflow) are scoped
 * to that one installation via the Backstage kubernetes proxy -- no muster MCP
 * session is needed for the reads.
 */
export const MusterInstanceProvider = ({
  children,
}: MusterInstanceProviderProps) => {
  const musterApi = useApi(musterApiRef);
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: installationsData, isLoading: isLoadingBackend } = useQuery({
    queryKey: ['muster', 'installations'],
    queryFn: () => musterApi.listInstallations(),
    refetchInterval: query =>
      hasUnknownReachability(query.state.data?.installations)
        ? INSTALLATIONS_REFETCH_WHILE_UNKNOWN_MS
        : false,
  });

  const backendInstallations = useMemo(
    () => installationsData?.installations ?? [],
    [installationsData],
  );

  const urlInstallation = searchParams.get('installation');
  const [stored, setStored] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const preferred = urlInstallation ?? stored;

  // Which installations run muster at all comes from the installation
  // inventory (one `GET /apis` per installation, home first); the backend only
  // knows where a muster *would* be. While the inventory is still loading
  // (home not answered), the list is not known yet and nothing is written back
  // to the URL, so a deep link is never replaced by a premature default.
  const inventory = useInstallationInventory();

  const installationInfos = useMemo(
    () => selectMusterInstallations(backendInstallations, inventory, preferred),
    [backendInstallations, inventory, preferred],
  );

  const installations = useMemo(
    () => installationInfos.map(i => i.name),
    [installationInfos],
  );

  const isLoadingInstallations = isLoadingBackend || inventory.isLoading;

  const activeInstallation = useMemo(
    () =>
      isLoadingInstallations
        ? undefined
        : resolveActive(installations, preferred),
    [isLoadingInstallations, installations, preferred],
  );

  const setActiveInstallation = useCallback(
    (installation: string) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, installation);
      } catch {
        // localStorage may be unavailable (private mode); URL state still works.
      }
      setStored(installation);
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.set('installation', installation);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Once installations resolve, write the chosen default back to the URL +
  // localStorage so the picker reflects it and deep links stay stable.
  //
  // NOTE: keep route-level redirects OUT of this provider's subtree. This is a
  // search-only navigation, so react-router resolves it against the pathname of
  // the render that created it; if a redirect below fires in the same commit,
  // this write lands on the pre-redirect path and silently undoes it. See the
  // note in MusterSection, which mounts its redirects as siblings for that
  // reason.
  useEffect(() => {
    if (!activeInstallation) {
      return;
    }
    if (stored !== activeInstallation) {
      try {
        window.localStorage.setItem(STORAGE_KEY, activeInstallation);
      } catch {
        // ignore
      }
      setStored(activeInstallation);
    }
    if (urlInstallation !== activeInstallation) {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.set('installation', activeInstallation);
          return next;
        },
        { replace: true },
      );
    }
  }, [activeInstallation, urlInstallation, stored, setSearchParams]);

  const activeInstallationInfo = useMemo(
    () => installationInfos.find(i => i.name === activeInstallation),
    [installationInfos, activeInstallation],
  );

  const clusters = activeInstallation ? [activeInstallation] : [];

  const {
    resources: mcpServers,
    errors: mcpServerErrors,
    isLoading: isLoadingServers,
    retry: retryServers,
    queries: mcpServerQueries,
  } = useResources(
    clusters,
    MCPServer,
    {},
    {
      refetchInterval: HEALTH_REFETCH_INTERVAL_MS,
    },
  );

  const {
    resources: workflows,
    errors: workflowErrors,
    retry: retryWorkflows,
    queries: workflowQueries,
  } = useResources(
    clusters,
    MusterWorkflow,
    {},
    {
      refetchInterval: HEALTH_REFETCH_INTERVAL_MS,
    },
  );

  // Freshness surfaced from the underlying react-query state: the newest
  // successful read across both CRD fan-outs, and whether any read is in
  // flight. The FreshnessIndicator turns these into "updated Xs ago" + a
  // spinner on the manual refresh control (ADR D4).
  const dataUpdatedAt = useMemo(() => {
    const times = [...mcpServerQueries, ...workflowQueries]
      .map(({ query }) => query.dataUpdatedAt)
      .filter(t => t > 0);
    return times.length > 0 ? Math.max(...times) : undefined;
  }, [mcpServerQueries, workflowQueries]);

  const isRefreshing = useMemo(
    () =>
      [...mcpServerQueries, ...workflowQueries].some(
        ({ query }) => query.isFetching,
      ),
    [mcpServerQueries, workflowQueries],
  );

  const errors = useMemo(
    () => [...mcpServerErrors, ...workflowErrors],
    [mcpServerErrors, workflowErrors],
  );

  // Surface real failures but hide the noisy RejectedError (auth not yet
  // granted) and version-incompatibility chatter for the active installation.
  const displayErrors = useMemo(
    () =>
      errors.filter(
        errorInfo =>
          errorInfo.type !== 'incompatibility' &&
          errorInfo.error.name !== 'RejectedError' &&
          errorInfo.error.name !== 'NotFoundError',
      ),
    [errors],
  );

  useShowErrors(displayErrors);

  const value: MusterInstance = useMemo(
    () => ({
      installations,
      installationInfos,
      isLoadingInstallations,
      activeInstallation,
      activeInstallationInfo,
      setActiveInstallation,
      mcpServers,
      workflows,
      isLoading:
        isLoadingInstallations ||
        (Boolean(activeInstallation) &&
          isLoadingServers &&
          mcpServers.length === 0),
      dataUpdatedAt,
      isRefreshing,
      retry: () => {
        retryServers();
        retryWorkflows();
      },
    }),
    [
      installations,
      installationInfos,
      isLoadingInstallations,
      activeInstallation,
      activeInstallationInfo,
      setActiveInstallation,
      mcpServers,
      workflows,
      isLoadingServers,
      dataUpdatedAt,
      isRefreshing,
      retryServers,
      retryWorkflows,
    ],
  );

  return (
    <MusterInstanceContext.Provider value={value}>
      {children}
    </MusterInstanceContext.Provider>
  );
};
