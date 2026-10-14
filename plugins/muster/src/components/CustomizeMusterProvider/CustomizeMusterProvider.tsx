import { type ReactNode, useMemo } from 'react';
import {
  type ConnectorGroup,
  connectorGroupCounts,
} from '../../lib/connectorGroups';
import { MusterProviders } from '../MusterProviders';
import { useMusterInstance } from '../MusterInstanceProvider';

/** What the Customize screen's tab strip counts; absent while still loading. */
export type MusterCustomizeCounts = {
  connectors?: number;
  /** The Connectors tab's sub-tabs, by `ConnectorGroup`. */
  connectorGroups?: Record<ConnectorGroup, number>;
  workflows?: number;
};

/**
 * The connectors (one per server family, singular server and muster itself,
 * where muster runs), per Connectors sub-tab and in all, and the workflows of
 * the active muster. Must be called inside a `CustomizeMusterProvider`.
 */
export function useMusterCustomizeCounts(): MusterCustomizeCounts {
  const { mcpServers, workflows, isLoading, activeInstallation } =
    useMusterInstance();
  const withMuster = activeInstallation !== undefined;
  const connectorGroups = useMemo(
    () => connectorGroupCounts(mcpServers, withMuster),
    [mcpServers, withMuster],
  );
  if (isLoading) {
    return {};
  }
  return {
    connectors:
      connectorGroups.yours +
      connectorGroups.infrastructure +
      connectorGroups.internal,
    connectorGroups,
    workflows: workflows.length,
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
