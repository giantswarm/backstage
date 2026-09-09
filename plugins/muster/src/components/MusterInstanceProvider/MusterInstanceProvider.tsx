import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import {
  ALL_INSTALLATIONS,
  selectInventoryFailure,
  useInstallationInventory,
  useInstallationScope,
  type InstallationScope,
  type InventoryFailure,
} from '@giantswarm/backstage-plugin-gs';
import {
  useResources,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { MCPServer, MusterWorkflow } from '../../lib/k8s';
import { MusterInstallationInfo } from '../../apis/types';
import { selectMusterInstallations } from './selectInstallations';
import { useMusterInstallations } from './useMusterInstallations';

// A light background refetch so the live health reads (per-MC pills, the
// "Servers healthy" stat, fleet coverage) don't drift silently from the CRD
// between page loads. Configured once here so both the dashboard and the
// MCP-servers manager inherit it (ADR D4). The reads are trivially cheap once
// the cluster auth is warm; the manual refresh control covers the gap between
// intervals.
const HEALTH_REFETCH_INTERVAL_MS = 30_000;

export type MusterInstance = {
  /**
   * The muster installations the section can show, home first: the backend's
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
   * answered yet; there is no active installation and no default is written.
   */
  isLoadingInstallations: boolean;
  /** The single active muster instance every screen is scoped to. */
  activeInstallation: string | undefined;
  /**
   * The section's installation scope the active instance was resolved from
   * (gs `useInstallationScope`, set by the page header's selector): `'all'`,
   * or a pinned installation. Differs from `activeInstallation` under "All
   * installations" and when the pinned installation runs no muster -- the two
   * cases `ActiveInstallationNote` explains on the views.
   */
  scope: InstallationScope;
  /** The home installation's name, once the installations config is known. */
  homeInstallation: string | undefined;
  /**
   * Why the installation this section would show -- the pinned one, else the
   * home installation -- could not be asked whether it runs muster: its
   * inventory probe failed (gs `selectInventoryFailure`), with a 401 the
   * person's token cannot repair, a 403 or another error. When that leaves the
   * section without an installation, `MusterSection` renders the gate that
   * explains it instead of a view. Undefined while the probe is pending or
   * once it answered.
   */
  inventoryFailure?: InventoryFailure;
  /** Re-runs the inventory probes (the gate's retry). */
  refreshInventory: () => void;
  /**
   * The portal knows one installation: the header shows no selector and the
   * section behaves as it did before it had a scope.
   */
  isSingleInstallation: boolean;
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
 * Resolves the active installation. Preference order: the section's pinned
 * installation scope if it is a real muster installation, then the muster on
 * the *current* cluster (matched by a host segment, e.g.
 * `devportal.<installation>.…` -> that installation), then the first
 * installation -- which is the home installation, since the list is home
 * first. Under "All installations" the tab therefore shows the home
 * installation: one muster is one aggregator.
 *
 * ponytail: "current cluster" is approximated by a host-segment match rather
 * than a dedicated config key -- good enough for the deployed devportal and a
 * fallback for portals without a home (falls through to the first
 * installation). Upgrade path: a `muster.currentInstallation` config if the
 * heuristic ever misfires.
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
 * instance follows the Agent Platform section's installation scope (gs
 * `useInstallationScope`: `?installation=` plus localStorage under the key
 * this provider used to own), set by the page header's selector -- the one
 * control that scopes every tab, MCP Servers included -- so "All
 * installations" shows the home muster. CRD reads (MCPServer, Workflow) are
 * scoped to that one installation via the Backstage kubernetes proxy -- no
 * muster MCP session is needed for the reads.
 */
export const MusterInstanceProvider = ({
  children,
}: MusterInstanceProviderProps) => {
  const { scope, setScope, home, isSingleInstallation } =
    useInstallationScope();

  const { installations: backendInstallations, isLoading: isLoadingBackend } =
    useMusterInstallations();

  // The pinned installation, or nothing under "All installations": then the
  // home muster is the one shown (see `resolveActive`).
  const preferred = scope === ALL_INSTALLATIONS ? null : scope;

  // Which installations run muster at all comes from the installation
  // inventory (one `GET /apis` per installation, home first); the backend only
  // knows where a muster *would* be. While the inventory is still loading
  // (home not answered), the list is not known yet and there is no active
  // installation, so a deep link is never replaced by a premature default.
  const inventory = useInstallationInventory();

  const installationInfos = useMemo(
    () => selectMusterInstallations(backendInstallations, inventory, preferred),
    [backendInstallations, inventory, preferred],
  );

  const installations = useMemo(
    () => installationInfos.map(i => i.name),
    [installationInfos],
  );

  // The failure to explain when the list above comes out empty: a pinned
  // installation's own, else the home's -- the section falls back to the home
  // when the pinned installation runs no muster, so the home's failure is the
  // reason there is nothing to show then.
  const inventoryFailure = useMemo(
    () =>
      selectInventoryFailure(inventory, preferred, { fallBackToHome: true }),
    [inventory, preferred],
  );
  const refreshInventory = inventory.refresh;

  const isLoadingInstallations = isLoadingBackend || inventory.isLoading;

  const activeInstallation = useMemo(
    () =>
      isLoadingInstallations
        ? undefined
        : resolveActive(installations, preferred),
    [isLoadingInstallations, installations, preferred],
  );

  // Choosing an installation through the section pins the whole scope (store,
  // localStorage, URL), exactly what the header selector does. Nothing is
  // written back on mount: the default (the home muster) is a resolution, not
  // a choice, and writing it would have pinned every tab of the section to one
  // installation.
  const setActiveInstallation = useCallback(
    (installation: string) => {
      setScope(installation);
    },
    [setScope],
  );

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
      scope,
      homeInstallation: home,
      inventoryFailure,
      refreshInventory,
      isSingleInstallation,
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
      scope,
      home,
      inventoryFailure,
      refreshInventory,
      isSingleInstallation,
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
