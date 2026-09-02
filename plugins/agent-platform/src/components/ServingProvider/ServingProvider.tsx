import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';
import { useReachableInstallations } from '../../hooks/useReachableInstallations';
import {
  findServedModelForEndpoint,
  mergeServingSnapshots,
  type ServedModel,
  type ServingSourceSnapshot,
} from '../../lib/serving';
import { useKServeServingSource } from './useKServeServingSource';

export type ServingContextValue = ServingSourceSnapshot & {
  /**
   * The served model a client base URL on `installation` points at — how a
   * kagent ModelConfig is linked to the InferenceService (or other backend)
   * fronting it. `undefined` for provider defaults and external endpoints.
   */
  servedModelForEndpoint: (
    installation: string,
    endpoint: string | undefined,
  ) => ServedModel | undefined;
};

const ServingContext = createContext<ServingContextValue | undefined>(
  undefined,
);

/**
 * What is being served across the reachable installations, from every serving
 * source the portal knows, merged into one backend-agnostic view.
 *
 * Sources are hooks called here in a fixed order and merged with
 * {@link mergeServingSnapshots}; each decides for itself which installations
 * it applies to (the KServe source: those serving the InferenceService CRD),
 * so an installation without any backend contributes nothing and the Serving
 * section stays hidden there. Adding a source — the model-manager API for
 * Ollama-backed installations — is one more hook call and array entry; the
 * table, capacity panel and ModelConfig linking below read only the merge.
 */
export function ServingProvider({ children }: { children: ReactNode }) {
  const { installations } = useInstallations();
  const allInstallations = installations.map(installation => installation.name);
  // Same narrowing as ModelConfigsProvider: never fan out to installations the
  // app does not currently consider reachable.
  const { installations: reachableInstallations } =
    useReachableInstallations(allInstallations);

  const kserve = useKServeServingSource(reachableInstallations);

  const value = useMemo<ServingContextValue>(() => {
    const snapshot = mergeServingSnapshots([kserve]);
    return {
      ...snapshot,
      servedModelForEndpoint: (installation, endpoint) =>
        findServedModelForEndpoint(
          endpoint,
          snapshot.servedModels.filter(
            model => model.installation === installation,
          ),
        ),
    };
  }, [kserve]);

  return (
    <ServingContext.Provider value={value}>{children}</ServingContext.Provider>
  );
}

export function useServing(): ServingContextValue {
  const ctx = useContext(ServingContext);
  if (!ctx) {
    throw new Error('useServing must be used within a ServingProvider');
  }
  return ctx;
}
