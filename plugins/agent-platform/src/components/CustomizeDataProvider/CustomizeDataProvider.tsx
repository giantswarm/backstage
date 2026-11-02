import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { RouteTabCount } from '@giantswarm/backstage-plugin-ui-react';
import {
  useSkillCatalog,
  type SkillCatalog,
} from '../../hooks/useSkillCatalog';
import { useScopedToolchainInstallations } from '../../hooks/useToolchainManager';
import { clientLookupOf } from '../../lib/serving';
import { uniqueSkills } from '../../lib/customize';
import { AgentsDataProvider, useAgents } from '../AgentsDataProvider';
import { ModelConfigsProvider, useModelConfigs } from '../ModelConfigsProvider';
import { ModelRow, toModelRow, toModelServedBy } from '../ModelsTable';
import { QueryClientProvider } from '../QueryClientProvider';
import { ServingProvider, useServing } from '../ServingProvider';
import {
  useWorkspacesData,
  WorkspacesDataProvider,
} from '../WorkspacesDataProvider';

/**
 * What the Customize screen's tab strip counts: `'loading'` while still being
 * read, absent when it could not be.
 */
export type CustomizeCounts = {
  agents?: RouteTabCount;
  skills?: RouteTabCount;
  models?: RouteTabCount;
  workspaces?: RouteTabCount;
};

export type CustomizeDataValue = {
  counts: CustomizeCounts;
  /**
   * Whether any skill repository is configured; `undefined` until the
   * signed-in config is known.
   */
  hasSkillRepositories?: boolean;
  /**
   * Whether an installation in scope offers workspaces (its muster lists the
   * workspace-manager); `undefined` until that is known.
   */
  hasWorkspaces?: boolean;
  /**
   * Whether an installation in scope offers toolchains (its muster lists the
   * toolchain-manager); `undefined` until that is known.
   */
  hasToolchains?: boolean;
  /** The models in scope, each with what the serving layer says about it. */
  modelRows: ModelRow[];
  skillCatalog: SkillCatalog;
};

/**
 * The skills the Skills tab lists, each once; unknown when no repository could
 * be read.
 */
function skillCountOf(catalog: SkillCatalog): RouteTabCount | undefined {
  if (catalog.isLoading) {
    return 'loading';
  }
  const unreadable =
    catalog.skills.length === 0 &&
    (catalog.error !== null || catalog.failedRepositories.length > 0);
  return unreadable ? undefined : uniqueSkills(catalog.skills).length;
}

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
  // Only what the strip reads: a list refetch leaves the other tabs alone.
  const {
    isAvailable: hasWorkspaces,
    isLoading: workspacesLoading,
    rows: { length: workspaceCount },
    failures: workspaceFailures,
  } = useWorkspacesData();
  const { hasToolchains } = useScopedToolchainInstallations();
  // Nothing read, a sign-in or a refusal in the way: no count, not "0".
  const workspacesUnread =
    workspaceCount === 0 && Object.keys(workspaceFailures).length > 0;

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
        agents: agents.isLoading ? 'loading' : agents.rows.length,
        models:
          modelsLoading && modelRows.length === 0
            ? 'loading'
            : modelRows.length,
        skills: skillCountOf(skillCatalog),
        workspaces: (() => {
          if (workspacesUnread) {
            return undefined;
          }
          return workspacesLoading && workspaceCount === 0
            ? 'loading'
            : workspaceCount;
        })(),
      },
      hasWorkspaces,
      hasToolchains,
      hasSkillRepositories: skillCatalog.isLoading
        ? undefined
        : skillCatalog.hasRepositories,
      modelRows,
      skillCatalog,
    }),
    [
      agents,
      modelsLoading,
      modelRows,
      skillCatalog,
      hasWorkspaces,
      hasToolchains,
      workspacesLoading,
      workspaceCount,
      workspacesUnread,
    ],
  );

  return (
    <CustomizeDataContext.Provider value={value}>
      {children}
    </CustomizeDataContext.Provider>
  );
}

/**
 * The agents, models, skills and workspaces of the shell's Customize screen,
 * read once for every tab so each tab's count is known before it is opened. The
 * children render inside this plugin's query client.
 */
export function CustomizeDataProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider>
      <ModelConfigsProvider>
        <ServingProvider>
          <AgentsDataProvider>
            <WorkspacesDataProvider>
              <CustomizeDataContextProvider>
                {children}
              </CustomizeDataContextProvider>
            </WorkspacesDataProvider>
          </AgentsDataProvider>
        </ServingProvider>
      </ModelConfigsProvider>
    </QueryClientProvider>
  );
}
