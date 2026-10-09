import type { ReactNode } from 'react';
import { partitionServers } from '../../lib/serverGrouping';
import { MusterProviders } from '../MusterProviders';
import { useMusterInstance } from '../MusterInstanceProvider';

/** What the Customize screen's tab strip counts; absent while still loading. */
export type MusterCustomizeCounts = {
  connectors?: number;
  workflows?: number;
};

/**
 * The connectors (one per server family or singular server, muster's own
 * tools left out) and workflows of the active muster. Must be called inside a
 * `CustomizeMusterProvider`.
 */
export function useMusterCustomizeCounts(): MusterCustomizeCounts {
  const { mcpServers, workflows, isLoading } = useMusterInstance();
  if (isLoading) {
    return {};
  }
  return {
    connectors: partitionServers(mcpServers).flatMap(group => group.rows)
      .length,
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
