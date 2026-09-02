import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useAutoWireServedModels } from '../../hooks/useAutoWireServedModels';
import { useModelConfigs } from '../ModelConfigsProvider';
import { useServing } from '../ServingProvider';
import type {
  ServedModelConsumer,
  ServedModelRow,
} from '../ServingPage/ServedModelsTable';

export type ServedModelRowsContextValue = {
  /**
   * Every served model of the reachable installations, with the ModelConfigs
   * pointing at it and the auto-wiring's progress where it has none yet.
   */
  rows: ServedModelRow[];
};

const ServedModelRowsContext = createContext<
  ServedModelRowsContextValue | undefined
>(undefined);

/**
 * The served models joined with the ModelConfigs that use them — the rows of
 * the Serving view — and the auto-wiring that completes a serve (see
 * useAutoWireServedModels), which runs off those rows.
 *
 * Lives above the Models views rather than inside the Serving view so the
 * wiring keeps running whichever view is open: the serve flow promises "the
 * model config is created once it is ready", and a user who serves a model and
 * then waits for it on the Model configs view must see it arrive there. Must
 * be mounted inside a ServingProvider, a ModelConfigsProvider and the plugin's
 * QueryClientProvider (the wiring is a react-query mutation).
 */
export function ServedModelRowsProvider({ children }: { children: ReactNode }) {
  const { servedModels, installations, servedModelFor } = useServing();
  const { modelConfigsFor, isLoading: isLoadingModelConfigs } =
    useModelConfigs();

  const candidates = useMemo<ServedModelRow[]>(() => {
    // Resolve every ModelConfig of an installation once against all of its
    // served models (the seam's rules disambiguate a shared Ollama host by
    // model name), then group by the model each one landed on — the inverse
    // of the "Served by" line on the ModelConfig rows, from the same matcher.
    const usedBy = new Map<string, ServedModelConsumer[]>();
    for (const installation of installations) {
      for (const modelConfig of modelConfigsFor(installation)) {
        const served = servedModelFor(installation, {
          endpoint: modelConfig.getEndpoint(),
          model: modelConfig.getModel(),
          modelConfig: {
            name: modelConfig.getName(),
            namespace: modelConfig.getNamespace(),
          },
        });
        if (!served) {
          continue;
        }
        const consumers = usedBy.get(served.id) ?? [];
        consumers.push({
          installation,
          namespace: modelConfig.getNamespace() ?? '',
          name: modelConfig.getName(),
          displayName: modelConfig.getDisplayName(),
        });
        usedBy.set(served.id, consumers);
      }
    }
    return servedModels.map(model => {
      const consumers = usedBy.get(model.id) ?? [];
      // The ModelConfig the serving backend knows for the model counts as a
      // consumer too — exact, and visible to a user who cannot list
      // ModelConfigs — so the auto-wiring does not try to create what exists.
      const known = model.modelConfig;
      if (
        known &&
        !consumers.some(
          consumer =>
            consumer.namespace === known.namespace &&
            consumer.name === known.name,
        )
      ) {
        consumers.push({
          installation: model.installation,
          namespace: known.namespace,
          name: known.name,
          displayName: known.name,
        });
      }
      return { ...model, usedBy: consumers };
    });
  }, [servedModels, installations, servedModelFor, modelConfigsFor]);

  const { wiringFor } = useAutoWireServedModels(candidates, modelConfigsFor, {
    modelConfigsLoading: isLoadingModelConfigs,
  });

  const value = useMemo<ServedModelRowsContextValue>(
    () => ({
      rows: candidates.map(row => ({ ...row, wiring: wiringFor(row.id) })),
    }),
    [candidates, wiringFor],
  );

  return (
    <ServedModelRowsContext.Provider value={value}>
      {children}
    </ServedModelRowsContext.Provider>
  );
}

export function useServedModelRows(): ServedModelRowsContextValue {
  const ctx = useContext(ServedModelRowsContext);
  if (!ctx) {
    throw new Error(
      'useServedModelRows must be used within a ServedModelRowsProvider',
    );
  }
  return ctx;
}
