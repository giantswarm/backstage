import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import {
  useResources,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { MCPServer, MusterWorkflow } from '../../lib/k8s';
import { musterApiRef } from '../../apis';

const STORAGE_KEY = 'muster-installation';

export type MusterInstance = {
  /**
   * The muster installations the picker may offer. Sourced from the backend's
   * `/installations` (config-driven), so it lists muster aggregators ONLY --
   * an MC without a muster can never appear here.
   */
  installations: string[];
  isLoadingInstallations: boolean;
  /** The single active muster instance every screen is scoped to. */
  activeInstallation: string | undefined;
  setActiveInstallation: (installation: string) => void;
  /** MCPServer CRs of the active instance (one installation, not fan-out). */
  mcpServers: MCPServer[];
  /** Workflow CRs of the active instance. */
  workflows: MusterWorkflow[];
  isLoading: boolean;
  retry: () => void;
};

const MusterInstanceContext = createContext<MusterInstance | undefined>(
  undefined,
);

export function useMusterInstance(): MusterInstance {
  const value = useContext(MusterInstanceContext);
  if (!value) {
    throw new Error('MusterInstanceContext not available');
  }
  return value;
}

/**
 * Resolves the default active installation. Preference order: an explicit
 * choice (URL/localStorage) if it is a real muster installation, then the
 * muster on the *current* cluster (matched by a host segment, e.g.
 * `devportal.gazelle.…` -> gazelle), then the first installation.
 *
 * ponytail: "current cluster" is approximated by a host-segment match rather
 * than a dedicated config key -- good enough for the deployed devportal and
 * harmless locally (falls through to the first installation). Upgrade path:
 * a `muster.currentInstallation` config if the heuristic ever misfires.
 */
function resolveActive(
  installations: string[],
  preferred: string | null,
): string | undefined {
  if (installations.length === 0) {
    return undefined;
  }
  if (preferred && installations.includes(preferred)) {
    return preferred;
  }
  const host = typeof window !== 'undefined' ? window.location.host : '';
  const hostSegments = host.split(/[.:]/);
  const local = installations.find(name => hostSegments.includes(name));
  return local ?? installations[0];
}

type MusterInstanceProviderProps = {
  children: ReactNode;
};

/**
 * Holds the single active muster instance and the muster-only installation
 * list, replacing the old multi-select MusterDataProvider. The active
 * instance is persisted via the `?installation=` URL param + localStorage so
 * deep links and refreshes keep it. CRD reads (MCPServer, Workflow) are scoped
 * to that one installation via the Backstage kubernetes proxy -- no muster MCP
 * session is needed for the reads.
 */
export const MusterInstanceProvider = ({
  children,
}: MusterInstanceProviderProps) => {
  const musterApi = useApi(musterApiRef);
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: installationsData, isLoading: isLoadingInstallations } =
    useQuery({
      queryKey: ['muster', 'installations'],
      queryFn: () => musterApi.listInstallations(),
    });

  const installations = useMemo(
    () => (installationsData?.installations ?? []).map(i => i.name),
    [installationsData],
  );

  const urlInstallation = searchParams.get('installation');
  const [stored, setStored] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const activeInstallation = useMemo(
    () => resolveActive(installations, urlInstallation ?? stored),
    [installations, urlInstallation, stored],
  );

  const setActiveInstallation = useCallback(
    (installation: string) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, installation);
      } catch {
        // localStorage may be unavailable (private mode); URL state still works.
      }
      setStored(installation);
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.set('installation', installation);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Once installations resolve, write the chosen default back to the URL +
  // localStorage so the picker reflects it and deep links stay stable.
  useEffect(() => {
    if (!activeInstallation) {
      return;
    }
    if (stored !== activeInstallation) {
      try {
        window.localStorage.setItem(STORAGE_KEY, activeInstallation);
      } catch {
        // ignore
      }
      setStored(activeInstallation);
    }
    if (urlInstallation !== activeInstallation) {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.set('installation', activeInstallation);
          return next;
        },
        { replace: true },
      );
    }
  }, [activeInstallation, urlInstallation, stored, setSearchParams]);

  const clusters = activeInstallation ? [activeInstallation] : [];

  const {
    resources: mcpServers,
    errors: mcpServerErrors,
    isLoading: isLoadingServers,
    retry: retryServers,
  } = useResources(clusters, MCPServer);

  const {
    resources: workflows,
    errors: workflowErrors,
    retry: retryWorkflows,
  } = useResources(clusters, MusterWorkflow);

  const errors = useMemo(
    () => [...mcpServerErrors, ...workflowErrors],
    [mcpServerErrors, workflowErrors],
  );

  // Surface real failures but hide the noisy RejectedError (auth not yet
  // granted) and version-incompatibility chatter for the active installation.
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

  const value: MusterInstance = useMemo(
    () => ({
      installations,
      isLoadingInstallations,
      activeInstallation,
      setActiveInstallation,
      mcpServers,
      workflows,
      isLoading:
        isLoadingInstallations ||
        (Boolean(activeInstallation) &&
          isLoadingServers &&
          mcpServers.length === 0),
      retry: () => {
        retryServers();
        retryWorkflows();
      },
    }),
    [
      installations,
      isLoadingInstallations,
      activeInstallation,
      setActiveInstallation,
      mcpServers,
      workflows,
      isLoadingServers,
      retryServers,
      retryWorkflows,
    ],
  );

  return (
    <MusterInstanceContext.Provider value={value}>
      {children}
    </MusterInstanceContext.Provider>
  );
};
