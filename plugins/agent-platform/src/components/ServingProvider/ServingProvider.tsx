import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';
import { useReachableInstallations } from '../../hooks/useReachableInstallations';
import {
  findServedModel,
  mergeServingSnapshots,
  NO_SERVING_CAPABILITIES,
  resolveClientServing,
  type ClientServingState,
  type ServedModel,
  type ServedModelLookup,
  type ServingBackend,
  type ServingCapabilities,
  type ServingSourceSnapshot,
} from '../../lib/serving';
import { useKServeServingSource } from './useKServeServingSource';
import { useModelManagerServingSource } from './useModelManagerServingSource';

export type ServingContextValue = ServingSourceSnapshot & {
  /**
   * The served model a client on `installation` points at — how a kagent
   * ModelConfig is linked to the InferenceService, Ollama model or other
   * backend fronting it (see `findServedModel` for the rules, applied with
   * the installation's declared multi-model hosts). `undefined` for provider
   * defaults, external endpoints, and a client of a multi-model host that
   * names no model listed there.
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
  /**
   * The serving layer's view of a client on `installation`
   * (`resolveClientServing`): the served model it fronts with that model's
   * readiness, or `notServing` for a model the layer knows nothing answers
   * for — an Ollama model deleted while its ModelConfig remained, a KServe
   * InferenceService stopped. `undefined` for provider defaults and external
   * endpoints; and, for the "gone" verdict alone, while any source is still
   * loading, since a model merely not listed *yet* must not read as gone.
   */
  servingStateFor: (
    installation: string,
    lookup: ServedModelLookup,
  ) => ClientServingState | undefined;
  /** The installation's capability flags; every flag false where no source reports any. */
  capabilitiesFor: (installation: string) => ServingCapabilities;
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
    const candidatesOn = (installation: string) =>
      snapshot.servedModels.filter(
        model => model.installation === installation,
      );
    const servedModelFor: ServingContextValue['servedModelFor'] = (
      installation,
      lookup,
    ) =>
      findServedModel(lookup, candidatesOn(installation), {
        sharedHosts: snapshot.sharedHosts?.[installation] ?? [],
      });
    const servingStateFor: ServingContextValue['servingStateFor'] = (
      installation,
      lookup,
    ) => {
      const candidates = candidatesOn(installation);
      // Every backend that has a say on the installation: what each source
      // reported (the merge keeps them all) and whatever the rows carry.
      const backends = Array.from(
        new Set(
          [
            ...(snapshot.sourceBackends?.[installation] ?? []),
            snapshot.backends[installation],
            ...candidates.map(model => model.backend),
          ].filter((backend): backend is ServingBackend => Boolean(backend)),
        ),
      );
      const state = resolveClientServing(lookup, {
        installation,
        candidates,
        backends,
        sharedHosts: snapshot.sharedHosts?.[installation] ?? [],
      });
      if (state && !state.model && snapshot.isLoading) {
        return undefined;
      }
      return state;
    };
    return {
      ...snapshot,
      servedModelFor,
      servedModelForEndpoint: (installation, endpoint) =>
        servedModelFor(installation, { endpoint }),
      servingStateFor,
      capabilitiesFor: installation =>
        snapshot.capabilities?.[installation] ?? NO_SERVING_CAPABILITIES,
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

/**
 * The serving context when a `ServingProvider` is mounted above, else
 * `undefined` — for consumers that only *enrich* with it (the agent rows'
 * model state) and must keep working where nobody mounted one.
 */
export function useOptionalServing(): ServingContextValue | undefined {
  return useContext(ServingContext);
}
