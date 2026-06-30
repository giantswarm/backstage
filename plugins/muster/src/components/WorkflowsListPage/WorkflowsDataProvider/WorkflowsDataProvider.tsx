import { createContext, ReactNode, useContext, useMemo } from 'react';
import { FiltersData, useFilters } from '@giantswarm/backstage-plugin-ui-react';
import { useMusterInstance } from '../../MusterInstanceProvider';
import { isGitOpsManaged } from '../../../lib/gitops';
import {
  NamespaceFilter,
  SourceFilter,
  StatusFilter,
} from '../filters/filters';

/**
 * A flattened, plain-object view of a `MusterWorkflow` CR. The shared
 * `@backstage/core-components` Table and the `useFilters` facets operate on
 * plain rows (like `DeploymentData`), not on the `MusterWorkflow` class
 * instance, so the getters are resolved once here.
 */
export type WorkflowRow = {
  name: string;
  namespace: string;
  description: string;
  stepCount: number;
  available: boolean;
  valid: boolean;
  validationWarning: boolean;
  source: 'gitops' | 'manual';
  /** The muster installation (cluster) the workflow lives on, for deep links. */
  cluster: string | undefined;
};

export type DefaultWorkflowFilters = {
  status?: StatusFilter;
  namespace?: NamespaceFilter;
  source?: SourceFilter;
};

export type WorkflowsData = FiltersData<DefaultWorkflowFilters> & {
  data: WorkflowRow[];
  filteredData: WorkflowRow[];
  isLoading: boolean;
};

const WorkflowsDataContext = createContext<WorkflowsData | undefined>(
  undefined,
);

export function useWorkflowsData(): WorkflowsData {
  const value = useContext(WorkflowsDataContext);

  if (!value) {
    throw new Error('WorkflowsDataContext not available');
  }

  return value;
}

type WorkflowsDataProviderProps = {
  children: ReactNode;
};

/**
 * Maps the active installation's Workflow CRs to plain `WorkflowRow`s and runs
 * the faceted filters, mirroring `DeploymentsDataProvider`. The raw workflows
 * come from `MusterInstanceProvider`, which is mounted above the workflows
 * router.
 */
export const WorkflowsDataProvider = ({
  children,
}: WorkflowsDataProviderProps) => {
  const { workflows, isLoading } = useMusterInstance();

  const { filters, queryParameters, updateFilters } =
    useFilters<DefaultWorkflowFilters>();

  const data: WorkflowRow[] = useMemo(() => {
    return workflows.map(workflow => ({
      name: workflow.getName(),
      namespace: workflow.getNamespace() ?? '',
      description: workflow.getDescription() ?? '',
      stepCount: workflow.getStepCount(),
      available: workflow.isRunnable(),
      valid: workflow.isValid(),
      validationWarning: workflow.hasValidationWarning(),
      source: isGitOpsManaged(workflow) ? 'gitops' : 'manual',
      cluster: workflow.cluster,
    }));
  }, [workflows]);

  const contextValue: WorkflowsData = useMemo(() => {
    const appliedFilters = Object.values(filters).filter(filter =>
      Boolean(filter),
    );

    const filteredData = data.filter(item => {
      return appliedFilters.every(filter => filter.filter(item));
    });

    return {
      data,
      filteredData,
      isLoading,

      filters,
      queryParameters,
      updateFilters,
    };
  }, [data, filters, isLoading, queryParameters, updateFilters]);

  return (
    <WorkflowsDataContext.Provider value={contextValue}>
      {children}
    </WorkflowsDataContext.Provider>
  );
};
