import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { workflowDetailRouteRef } from '../../../routes';

export interface WorkflowPageLinks {
  /** A workflow's page, its Overview, on the installation it runs on. */
  workflow: (name: string, installation: string) => string | undefined;
}

/**
 * Links to workflow pages, on the installation the workflow runs on: it is
 * part of the path (`<installation>/<name>`), since a workflow is read by
 * name on one installation. Undefined while the route is unbound, and
 * without an installation.
 */
export function useWorkflowPageLinks(): WorkflowPageLinks {
  const detailRoute = useRouteRef(workflowDetailRouteRef);
  return useMemo(
    () => ({
      workflow: (name, installation) =>
        detailRoute && installation
          ? detailRoute({ installation, name })
          : undefined,
    }),
    [detailRoute],
  );
}
