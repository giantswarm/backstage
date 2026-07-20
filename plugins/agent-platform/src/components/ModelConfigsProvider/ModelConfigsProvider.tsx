import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import {
  isNotFoundError,
  ModelConfig,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useReachableInstallations } from '../../hooks/useReachableInstallations';

export type ModelConfigsContextValue = {
  /** Discovery/list still in flight across the fleet. */
  isLoading: boolean;
  /** Whether any installation is configured at all. */
  hasInstallations: boolean;
  /**
   * Installations (in config order) that returned at least one ModelConfig —
   * i.e. the ones where creating an agent is actually possible.
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
 * Queries kagent ModelConfigs across every reachable installation once, and
 * exposes which installations actually have models. Shared by the installation
 * select (to only offer usable installations) and the model picker (to list a
 * selected installation's models) so the fleet is only queried once.
 */
export function ModelConfigsProvider({ children }: { children: ReactNode }) {
  const configApi = useApi(configApiRef);
  const allInstallations =
    configApi.getOptionalConfig('gs.installations')?.keys() ?? [];

  // Only query installations the app currently considers reachable, so the
  // fleet-wide query doesn't fan out to unreachable/forbidden clusters (each of
  // which otherwise hangs for the full proxy timeout and retries before
  // settling, dominating the tail).
  const { installations: reachableInstallations, isProbing } =
    useReachableInstallations(allInstallations);

  // We type against a single ModelConfig version (v1alpha2), so skip API
  // version discovery: it adds two round-trips per cluster plus its own retry
  // storm for no benefit here.
  const { resources, isLoading, errors } = useResources(
    reachableInstallations,
    ModelConfig,
    {},
    { enableDiscovery: false },
  );

  const allInstallationsKey = allInstallations.join(',');
  const reachableInstallationsKey = reachableInstallations.join(',');

  const value = useMemo<ModelConfigsContextValue>(() => {
    const withModels = new Set(resources.map(mc => mc.cluster));

    // A 404 means the kagent.dev API group isn't installed on that cluster, so it
    // simply has no ModelConfigs — not a "couldn't read" failure. Only genuine
    // failures (403 forbidden, unreachable) that produced no models are surfaced.
    const unreachableInstallations = Array.from(
      new Set(errors.filter(e => !isNotFoundError(e)).map(e => e.cluster)),
    ).filter(name => !withModels.has(name));

    return {
      isLoading: isProbing || isLoading,
      hasInstallations: allInstallations.length > 0,
      availableInstallations: reachableInstallations.filter(name =>
        withModels.has(name),
      ),
      unreachableInstallations,
      modelConfigsFor: (installation: string) =>
        resources.filter(mc => mc.cluster === installation),
    };
    // allInstallations/reachableInstallations are derived fresh each render;
    // key on their contents (…Key) rather than identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    resources,
    errors,
    isLoading,
    isProbing,
    allInstallationsKey,
    reachableInstallationsKey,
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
