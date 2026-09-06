import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  isNotFoundError,
  ModelConfig,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  applyInstallationScope,
  useInstallationInventory,
  useInstallations,
  useInstallationScope,
  type InstallationScope,
} from '@giantswarm/backstage-plugin-gs';

export type ModelConfigsContextValue = {
  /** Discovery/list still in flight across the fleet. */
  isLoading: boolean;
  /** Whether any installation is configured at all. */
  hasInstallations: boolean;
  /** The section's installation scope the reads are narrowed to. */
  scope: InstallationScope;
  /** The home installation's name, when the portal has one. */
  home: string | undefined;
  /**
   * The installations in scope that run kagent and are reachable, home first:
   * the ones queried, and the order a list groups them in.
   */
  installations: string[];
  /**
   * Installations in `installations` without a first answer yet -- in flight,
   * or not asked until the home installation has answered.
   */
  pendingInstallations: string[];
  /**
   * Installations (home first, then in inventory order) that returned at least
   * one ModelConfig — i.e. the ones where creating an agent is actually possible.
   */
  availableInstallations: string[];
  /**
   * Installations we queried but couldn't read (unreachable, or the user lacks
   * permission to list ModelConfigs there). Surfaced instead of silently
   * dropped so an empty result is distinguishable from a failed one.
   */
  unreachableInstallations: string[];
  /** ModelConfigs found on a given installation. */
  modelConfigsFor: (installation: string) => ModelConfig[];
};

const ModelConfigsContext = createContext<ModelConfigsContextValue | undefined>(
  undefined,
);

/**
 * Queries kagent ModelConfigs across every installation in the section's scope
 * that runs kagent once, and exposes which installations actually have models.
 * Shared by the installation select (to only offer usable installations) and
 * the model picker (to list a selected installation's models) so the fleet is
 * only queried once.
 */
export function ModelConfigsProvider({ children }: { children: ReactNode }) {
  const { installations } = useInstallations();
  const allInstallations = installations.map(installation => installation.name);

  // Only query installations whose inventory has the `kagent.dev` API group and
  // whose access is healthy, home first (gs `useInstallationInventory`),
  // narrowed to the section's scope: the fleet-wide query fans out neither to
  // clusters without kagent (a 404 per installation per tab before) nor to
  // unreachable/forbidden ones (each of which otherwise hangs for the full
  // proxy timeout and retries before settling, dominating the tail).
  const inventory = useInstallationInventory();
  const { scope, home } = useInstallationScope();
  const scopedInstallations = applyInstallationScope(
    inventory.installationsWith('kagent'),
    scope,
  );
  const isProbing = inventory.isLoading || inventory.isProbing;

  // Installations that have answered at least once (rows, an empty list, or a
  // failure) since this provider mounted. `useResources` only reports on the
  // installations currently queried, and which ones those are depends on
  // this -- so it is remembered, not derived.
  const [settledInstallations, setSettledInstallations] = useState<
    ReadonlySet<string>
  >(() => new Set());

  // Home first, literally: the home installation is queried alone, and the
  // others only once it has answered, so its models are on screen before any
  // other installation is asked. A portal without a home, or a scope that
  // leaves the home out, queries everything in scope from the start.
  const homeSettled =
    home === undefined ||
    !scopedInstallations.includes(home) ||
    settledInstallations.has(home);
  const queriedInstallations = homeSettled
    ? scopedInstallations
    : scopedInstallations.filter(installation => installation === home);

  // We type against a single ModelConfig version (v1alpha2), so skip API
  // version discovery: it adds two round-trips per cluster plus its own retry
  // storm for no benefit here.
  const { resources, clustersData, isLoading, errors } = useResources(
    queriedInstallations,
    ModelConfig,
    {},
    { enableDiscovery: false },
  );

  const answeredKey = [
    ...clustersData.map(({ cluster }) => cluster),
    ...errors.map(({ cluster }) => cluster),
  ]
    .sort()
    .join(',');
  useEffect(() => {
    const answered = answeredKey ? answeredKey.split(',') : [];
    setSettledInstallations(prev => {
      if (answered.every(installation => prev.has(installation))) {
        return prev;
      }
      return new Set([...prev, ...answered]);
    });
  }, [answeredKey]);

  const allInstallationsKey = allInstallations.join(',');
  const scopedInstallationsKey = scopedInstallations.join(',');

  const value = useMemo<ModelConfigsContextValue>(() => {
    const withModels = new Set(resources.map(mc => mc.cluster));

    // A 404 means the kagent.dev API group has gone since the (hour-long)
    // inventory answered, so the cluster simply has no ModelConfigs — not a
    // "couldn't read" failure. Only genuine failures (403 forbidden,
    // unreachable) that produced no models are surfaced.
    const unreachableInstallations = Array.from(
      new Set(errors.filter(e => !isNotFoundError(e)).map(e => e.cluster)),
    ).filter(name => !withModels.has(name));

    const answered = new Set([
      ...settledInstallations,
      ...clustersData.map(({ cluster }) => cluster),
      ...errors.map(({ cluster }) => cluster),
    ]);

    return {
      isLoading: isProbing || isLoading || !homeSettled,
      hasInstallations: allInstallations.length > 0,
      scope,
      home,
      installations: scopedInstallations,
      pendingInstallations: scopedInstallations.filter(
        name => !answered.has(name),
      ),
      availableInstallations: scopedInstallations.filter(name =>
        withModels.has(name),
      ),
      unreachableInstallations,
      modelConfigsFor: (installation: string) =>
        resources.filter(mc => mc.cluster === installation),
    };
    // allInstallations/scopedInstallations are derived fresh each render;
    // key on their contents (…Key) rather than identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    resources,
    clustersData,
    errors,
    isLoading,
    isProbing,
    homeSettled,
    settledInstallations,
    scope,
    home,
    allInstallationsKey,
    scopedInstallationsKey,
  ]);

  return (
    <ModelConfigsContext.Provider value={value}>
      {children}
    </ModelConfigsContext.Provider>
  );
}

export function useModelConfigs(): ModelConfigsContextValue {
  const ctx = useContext(ModelConfigsContext);
  if (!ctx) {
    throw new Error(
      'useModelConfigs must be used within a ModelConfigsProvider',
    );
  }
  return ctx;
}
