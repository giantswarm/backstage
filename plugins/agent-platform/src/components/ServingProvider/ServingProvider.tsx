import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';
import { useReachableInstallations } from '../../hooks/useReachableInstallations';
import {
  findServedModel,
  mergeServingSnapshots,
  type ServedModel,
  type ServedModelLookup,
  type ServingSourceSnapshot,
} from '../../lib/serving';
import { useKServeServingSource } from './useKServeServingSource';
import { useModelManagerServingSource } from './useModelManagerServingSource';

export type ServingContextValue = ServingSourceSnapshot & {
  /**
   * The served model a client on `installation` points at — how a kagent
   * ModelConfig is linked to the InferenceService, Ollama model or other
   * backend fronting it (see `findServedModel` for the rules). `undefined`
   * for provider defaults and external endpoints.
   */
  servedModelFor: (
    installation: string,
    lookup: ServedModelLookup,
  ) => ServedModel | undefined;
  /** {@link servedModelFor} by endpoint alone. */
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
 * it applies to (the KServe source: those serving the InferenceService CRD;
 * the model-manager source: those the backend proxies a model-manager for),
 * so an installation without any backend contributes nothing and the Serving
 * section stays hidden there. The table, capacity panel and ModelConfig
 * linking below read only the merge.
 *
 * Order matters only where both sources claim one installation (a lab with
 * KServe CRDs *and* a model-manager): the later, model-manager source then
 * decides the installation's backend label, while the served models of both
 * are listed side by side and their capabilities are OR-ed.
 */
export function ServingProvider({ children }: { children: ReactNode }) {
  const { installations } = useInstallations();
  const allInstallations = installations.map(installation => installation.name);
  // Same narrowing as ModelConfigsProvider: never fan out to installations the
  // app does not currently consider reachable.
  const { installations: reachableInstallations } =
    useReachableInstallations(allInstallations);

  const kserve = useKServeServingSource(reachableInstallations);
  const modelManager = useModelManagerServingSource(reachableInstallations);

  const value = useMemo<ServingContextValue>(() => {
    const snapshot = mergeServingSnapshots([kserve, modelManager]);
    const servedModelFor: ServingContextValue['servedModelFor'] = (
      installation,
      lookup,
    ) =>
      findServedModel(
        lookup,
        snapshot.servedModels.filter(
          model => model.installation === installation,
        ),
      );
    return {
      ...snapshot,
      servedModelFor,
      servedModelForEndpoint: (installation, endpoint) =>
        servedModelFor(installation, { endpoint }),
    };
  }, [kserve, modelManager]);

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
