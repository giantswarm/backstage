import type { ReactElement } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useScrollToTopOnNavigation } from '@giantswarm/backstage-plugin-ui-react';
import { WorkflowPage } from '../WorkflowPage';
import { CustomizeTabRedirect } from '../CustomizeTabRedirect';

/**
 * Routing within the Agent Platform's Workflows sub-page: a workflow's
 * read-only page (per decision D11 no create/edit/delete lives there). The
 * list is the Customize screen's Workflows tab, so the index sends there.
 * Mounted inside MusterProviders by the workflows sub-page.
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
      <Route index element={<CustomizeTabRedirect tab="workflows" />} />
      <Route
        path=":name/*"
        element={<WorkflowPage editAction={editAction} />}
      />
    </Routes>
  );
};
