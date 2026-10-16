import type { ReactElement } from 'react';
import { Navigate, Routes, Route, useParams } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useScrollToTopOnNavigation } from '@giantswarm/backstage-plugin-ui-react';
import { workflowsRouteRef } from '../../routes';
import { MusterSubPage } from '../MusterSubPage';
import { WorkflowPage } from '../WorkflowPage';

/** An unknown address under the tab: the nearest valid parent, the list. */
function ListRedirect() {
  const workflows = useRouteRef(workflowsRouteRef);
  return workflows ? <Navigate to={workflows()} replace /> : null;
}

/**
 * One workflow's page, inside the muster providers pinned to the
 * installation the address names, so it reads the workflow there whatever
 * the section's scope.
 */
function WorkflowRoute({ editAction }: { editAction?: ReactElement }) {
  const { installation = '' } = useParams();
  return (
    <MusterSubPage
      context="The workflows of an environment are read through its Kubernetes API."
      installation={installation}
    >
      <WorkflowPage editAction={editAction} />
    </MusterSubPage>
  );
}

/**
 * Routing within the Customize screen's Workflows tab (`/customize/workflows`,
 * whose bare path is the Customize screen's list): a workflow's page at
 * `<installation>/<name>` (no create, edit or delete lives there; it runs the
 * workflow). Anything else is the list, the nearest valid parent.
 *
 * `editAction` is the element another plugin attaches to the sub-page's
 * `editAction` input; the workflow page shows it beside its title.
 */
export const WorkflowsRouter = ({
  editAction,
}: { editAction?: ReactElement } = {}) => {
  // A workflow opened from far down the list opens at its top.
  useScrollToTopOnNavigation();
  return (
    <Routes>
      <Route
        path=":installation/:name/*"
        element={<WorkflowRoute editAction={editAction} />}
      />
      <Route path="*" element={<ListRedirect />} />
    </Routes>
  );
};
