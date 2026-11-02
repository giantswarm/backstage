import { type ReactNode, useMemo } from 'react';
import type { RouteTabCount } from '@giantswarm/backstage-plugin-ui-react';
import { serverPageRows } from '../../lib/serverList';
import { MusterProviders } from '../MusterProviders';
import { useMusterInstance } from '../MusterInstanceProvider';

/** What the Customize screen's tab strip counts; `'loading'` while loading. */
export type MusterCustomizeCounts = {
  connectors?: RouteTabCount;
  workflows?: RouteTabCount;
};

const LOADING: Required<MusterCustomizeCounts> = {
  connectors: 'loading',
  workflows: 'loading',
};

/**
 * The connectors (one per server family, singular server and muster itself,
 * where muster runs) and the workflows of
 * the active muster. Must be called inside a `CustomizeMusterProvider`.
 */
export function useMusterCustomizeCounts(): MusterCustomizeCounts {
  const {
    mcpServers,
    workflows,
    isLoading,
    isLoadingWorkflows,
    activeInstallation,
  } = useMusterInstance();
  const withMuster = activeInstallation !== undefined;
  // muster itself counts only where it runs: without a muster installation
  // the list is not shown.
  const connectors = useMemo(
    () =>
      serverPageRows(mcpServers).filter(
        row => row.kind !== 'core' || withMuster,
      ).length,
    [mcpServers, withMuster],
  );
  if (isLoading) {
    return LOADING;
  }
  return {
    connectors,
    // A separate read: the servers can land first, and a 0 meanwhile would
    // jump to the real number.
    workflows: isLoadingWorkflows ? 'loading' : workflows.length,
  };
}

/**
 * The muster state the shell's Customize screen reads: the active muster
 * installation, its servers and its workflows. The children render inside
 * muster's query client.
 */
export function CustomizeMusterProvider({ children }: { children: ReactNode }) {
  return <MusterProviders>{children}</MusterProviders>;
}
