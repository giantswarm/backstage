import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { withInstallationQuery } from '../../../lib/installationLink';
import { workflowDetailRouteRef } from '../../../routes';

export interface WorkflowPageLinks {
  /** A workflow's page, its Overview, on the installation it runs on. */
  workflow: (name: string, installation: string) => string | undefined;
}

/**
 * Links to workflow pages. Every one carries `?installation=`: a workflow is
 * read by name on that installation, and the section's scope reads it before
 * the stored choice. Undefined while the route is unbound.
 */
export function useWorkflowPageLinks(): WorkflowPageLinks {
  const detailRoute = useRouteRef(workflowDetailRouteRef);
  return useMemo(
    () => ({
      workflow: (name, installation) =>
        detailRoute
          ? withInstallationQuery(detailRoute({ name }), installation)
          : undefined,
    }),
    [detailRoute],
  );
}
