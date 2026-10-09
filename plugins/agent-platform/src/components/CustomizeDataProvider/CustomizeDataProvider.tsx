import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  useSkillCatalog,
  type SkillCatalog,
} from '../../hooks/useSkillCatalog';
import { clientLookupOf } from '../../lib/serving';
import { organizationsOf } from '../../lib/customize';
import { AgentsDataProvider, useAgents } from '../AgentsDataProvider';
import { ModelConfigsProvider, useModelConfigs } from '../ModelConfigsProvider';
import { ModelRow, toModelRow, toModelServedBy } from '../ModelsTable';
import { QueryClientProvider } from '../QueryClientProvider';
import { ServingProvider, useServing } from '../ServingProvider';

/** What the Customize screen's tab strip counts; absent while still loading. */
export type CustomizeCounts = {
  agents?: number;
  skills?: number;
  models?: number;
};

export type CustomizeDataValue = {
  counts: CustomizeCounts;
  /**
   * Whether any skill repository is configured; `undefined` until the
   * signed-in config is known.
   */
  hasSkillRepositories?: boolean;
  /** The namespaces the agents in scope live in. */
  agentOrganizations: string[];
  /** The namespaces the models in scope live in. */
  modelOrganizations: string[];
  /** The models in scope, each with what the serving layer says about it. */
  modelRows: ModelRow[];
  skillCatalog: SkillCatalog;
};

const CustomizeDataContext = createContext<CustomizeDataValue | undefined>(
  undefined,
);

export function useCustomizeData(): CustomizeDataValue {
  const value = useContext(CustomizeDataContext);
  if (!value) {
    throw new Error('CustomizeDataContext not available');
  }
  return value;
}

function CustomizeDataContextProvider({ children }: { children: ReactNode }) {
  const agents = useAgents();
  const {
    installations: modelInstallations,
    modelConfigsFor,
    isLoading: modelsLoading,
  } = useModelConfigs();
  const { servingStateFor, capabilitiesFor, backends } = useServing();
  const skillCatalog = useSkillCatalog();

  const modelRows = useMemo<ModelRow[]>(
    () =>
      modelInstallations.flatMap(installation =>
        modelConfigsFor(installation).map(modelConfig => {
          const state = servingStateFor(
            installation,
            clientLookupOf(modelConfig),
          );
          return toModelRow(
            modelConfig,
            state
              ? toModelServedBy(
                  state,
                  capabilitiesFor(installation, state.model?.backend),
                  state.model?.backend ?? backends[installation],
                )
              : undefined,
          );
        }),
      ),
    [
      modelInstallations,
      modelConfigsFor,
      servingStateFor,
      capabilitiesFor,
      backends,
    ],
  );

  const value = useMemo<CustomizeDataValue>(
    () => ({
      counts: {
        agents: agents.isLoading ? undefined : agents.rows.length,
        models:
          modelsLoading && modelRows.length === 0
            ? undefined
            : modelRows.length,
        skills: skillCatalog.isLoading ? undefined : skillCatalog.skills.length,
      },
      hasSkillRepositories: skillCatalog.isLoading
        ? undefined
        : skillCatalog.hasRepositories,
      agentOrganizations: organizationsOf(agents.rows),
      modelOrganizations: organizationsOf(modelRows),
      modelRows,
      skillCatalog,
    }),
    [agents, modelsLoading, modelRows, skillCatalog],
  );

  return (
    <CustomizeDataContext.Provider value={value}>
      {children}
    </CustomizeDataContext.Provider>
  );
}

/**
 * The agents, models and skills of the shell's Customize screen, read once
 * for every tab so each tab's count is known before it is opened. The
 * children render inside this plugin's query client.
 */
export function CustomizeDataProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider>
      <ModelConfigsProvider>
        <ServingProvider>
          <AgentsDataProvider>
            <CustomizeDataContextProvider>
              {children}
            </CustomizeDataContextProvider>
          </AgentsDataProvider>
        </ServingProvider>
      </ModelConfigsProvider>
    </QueryClientProvider>
  );
}
