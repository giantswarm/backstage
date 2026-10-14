import { useMemo } from 'react';
import { useModelConfigs } from '../ModelConfigsProvider';

/** One model configuration as the palette lists it. */
export type PaletteModel = {
  id: string;
  installation: string;
  namespace: string;
  name: string;
  displayName: string;
  /** "OpenAI · gpt-4o", the line Customize › Models shows under the name. */
  description?: string;
};

export type PaletteModels = {
  rows: PaletteModel[];
  isLoading: boolean;
};

/**
 * The model configurations the shell already reads through
 * `ModelConfigsProvider` (the Models tab's source), as palette rows.
 */
export function usePaletteModels(): PaletteModels {
  const { installations, modelConfigsFor, isLoading } = useModelConfigs();

  const rows = useMemo(
    () =>
      installations.flatMap(installation =>
        modelConfigsFor(installation).map(modelConfig => {
          const namespace = modelConfig.getNamespace() ?? '';
          const description = [
            modelConfig.getProvider(),
            modelConfig.getModel(),
          ]
            .filter(Boolean)
            .join(' · ');
          return {
            id: `${installation}/${namespace}/${modelConfig.getName()}`,
            installation,
            namespace,
            name: modelConfig.getName(),
            displayName: modelConfig.getDisplayName(),
            ...(description ? { description } : {}),
          };
        }),
      ),
    [installations, modelConfigsFor],
  );

  return { rows, isLoading };
}
