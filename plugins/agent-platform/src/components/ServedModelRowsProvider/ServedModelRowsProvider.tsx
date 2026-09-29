import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useModelConfigs } from '../ModelConfigsProvider';
import { useServing } from '../ServingProvider';
import type {
  ServedModelConsumer,
  ServedModelRow,
} from '../ServingPage/ServedModelsTable';

export type ServedModelRowsContextValue = {
  /** Every served model of the reachable installations, with the ModelConfigs pointing at it. */
  rows: ServedModelRow[];
};

const ServedModelRowsContext = createContext<
  ServedModelRowsContextValue | undefined
>(undefined);

/**
 * The served models joined with the ModelConfigs that use them — the rows of
 * the Serving view, and what the Model configs view reads the other way
 * round. Must be mounted inside a ServingProvider and a ModelConfigsProvider.
 */
export function ServedModelRowsProvider({ children }: { children: ReactNode }) {
  const { servedModels, installations, servedModelFor } = useServing();
  const { modelConfigsFor } = useModelConfigs();

  const rows = useMemo<ServedModelRow[]>(() => {
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
      // ModelConfigs.
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

  const value = useMemo<ServedModelRowsContextValue>(() => ({ rows }), [rows]);

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
