import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import {
  ModelConfig,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';

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
  /** ModelConfigs found on a given installation. */
  modelConfigsFor: (installation: string) => ModelConfig[];
};

const ModelConfigsContext = createContext<ModelConfigsContextValue | undefined>(
  undefined,
);

/**
 * Queries kagent ModelConfigs across every configured installation once, and
 * exposes which installations actually have models. Shared by the installation
 * select (to only offer usable installations) and the model picker (to list a
 * selected installation's models) so the fleet is only queried once.
 */
export function ModelConfigsProvider({ children }: { children: ReactNode }) {
  const configApi = useApi(configApiRef);
  const allInstallations =
    configApi.getOptionalConfig('gs.installations')?.keys() ?? [];

  const { resources, isLoading } = useResources(allInstallations, ModelConfig);

  const value = useMemo<ModelConfigsContextValue>(() => {
    const withModels = new Set(resources.map(mc => mc.cluster));

    return {
      isLoading,
      hasInstallations: allInstallations.length > 0,
      availableInstallations: allInstallations.filter(name =>
        withModels.has(name),
      ),
      modelConfigsFor: (installation: string) =>
        resources.filter(mc => mc.cluster === installation),
    };
    // allInstallations is derived fresh each render from config; key on its
    // contents rather than identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources, isLoading, allInstallations.join(',')]);

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
