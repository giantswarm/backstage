import { useMemo } from 'react';
import { useResources } from '@giantswarm/backstage-plugin-kubernetes-react';
import { MusterWorkflow } from '@giantswarm/backstage-plugin-muster';

/** One workflow as the palette lists it. */
export type PaletteWorkflow = {
  name: string;
  description?: string;
  /** The installation whose muster runs it: the page is per installation. */
  installation: string;
};

export type PaletteWorkflows = {
  rows: PaletteWorkflow[];
  isLoading: boolean;
};

/**
 * The workflows across the given installations, read as muster's Workflow CRs
 * through the Backstage kubernetes proxy like {@link usePaletteConnectors} —
 * no muster session needed. A workflow is a page per installation, so one
 * defined on two installations is two rows.
 */
export function usePaletteWorkflows(installations: string[]): PaletteWorkflows {
  const { resources, isLoading } = useResources(
    installations,
    MusterWorkflow,
    {},
    { enabled: installations.length > 0 },
  );

  const rows = useMemo(
    () =>
      resources
        .map(workflow => ({
          name: workflow.getName(),
          description: workflow.getDescription() || undefined,
          installation: workflow.cluster,
        }))
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) ||
            a.installation.localeCompare(b.installation),
        ),
    [resources],
  );

  return {
    rows,
    isLoading: installations.length > 0 && isLoading,
  };
}
