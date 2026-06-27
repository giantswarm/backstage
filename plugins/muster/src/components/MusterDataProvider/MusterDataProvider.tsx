import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import {
  useResources,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { MCPServer, MusterWorkflow } from '../../lib/k8s';

export type MusterData = {
  /** Installations currently selected in the InstallationPicker. */
  activeInstallations: string[];
  setActiveInstallations: (installations: string[]) => void;
  /** Aggregated MCPServer CRs across all selected installations. */
  mcpServers: MCPServer[];
  /** Workflow CRs across all selected installations. */
  workflows: MusterWorkflow[];
  /** True only until the first installation produces data. */
  isLoading: boolean;
  retry: () => void;
};

const MusterDataContext = createContext<MusterData | undefined>(undefined);

export function useMusterData(): MusterData {
  const value = useContext(MusterDataContext);
  if (!value) {
    throw new Error('MusterDataContext not available');
  }
  return value;
}

type MusterDataProviderProps = {
  children: ReactNode;
};

/**
 * Fans the muster CRDs (MCPServer, Workflow) out across every selected
 * installation via the Backstage kubernetes proxy. Mirrors the clusters page's
 * ClustersDataProvider: per-installation errors are isolated, and the view
 * unblocks as soon as any installation resolves. No muster MCP session is
 * needed for any of this -- it is pure k8s read.
 */
export const MusterDataProvider = ({ children }: MusterDataProviderProps) => {
  const [activeInstallations, setActiveInstallations] = useState<string[]>([]);

  const {
    resources: mcpServers,
    errors: mcpServerErrors,
    isLoading: isLoadingServers,
    retry: retryServers,
  } = useResources(activeInstallations, MCPServer);

  const {
    resources: workflows,
    errors: workflowErrors,
    retry: retryWorkflows,
  } = useResources(activeInstallations, MusterWorkflow);

  const errors = useMemo(
    () => [...mcpServerErrors, ...workflowErrors],
    [mcpServerErrors, workflowErrors],
  );

  // Same policy as the clusters page: surface real failures but hide the noisy
  // RejectedError (auth not yet granted for an MC) and version incompatibility
  // chatter for clusters that simply don't run muster.
  const displayErrors = useMemo(
    () =>
      errors.filter(
        errorInfo =>
          errorInfo.type !== 'incompatibility' &&
          errorInfo.error.name !== 'RejectedError' &&
          errorInfo.error.name !== 'NotFoundError',
      ),
    [errors],
  );

  useShowErrors(displayErrors);

  const value: MusterData = useMemo(
    () => ({
      activeInstallations,
      setActiveInstallations,
      mcpServers,
      workflows,
      isLoading: isLoadingServers && mcpServers.length === 0,
      retry: () => {
        retryServers();
        retryWorkflows();
      },
    }),
    [
      activeInstallations,
      mcpServers,
      workflows,
      isLoadingServers,
      retryServers,
      retryWorkflows,
    ],
  );

  return (
    <MusterDataContext.Provider value={value}>
      {children}
    </MusterDataContext.Provider>
  );
};
