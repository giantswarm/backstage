import type { ReactElement } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { customizeExternalRouteRef } from '../../routes';
import { WorkflowsRouter } from './WorkflowsRouter';

jest.mock('../WorkflowPage', () => ({
  WorkflowPage: ({ editAction }: { editAction?: ReactElement }) => (
    <div>
      <p>Workflow page</p>
      {editAction}
    </div>
  ),
}));

function Landed() {
  const { pathname, search } = useLocation();
  return <p>{`landed: ${pathname}${search}`}</p>;
}

function renderAt(
  path: string,
  {
    withCustomize = true,
    editAction,
  }: { withCustomize?: boolean; editAction?: ReactElement } = {},
) {
  return renderInTestApp(
    <Routes>
      <Route
        path="/agent-platform/workflows/*"
        element={<WorkflowsRouter editAction={editAction} />}
      />
      <Route path="/customize/*" element={<Landed />} />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: withCustomize
        ? { '/customize': customizeExternalRouteRef }
        : {},
    },
  );
}

describe('WorkflowsRouter', () => {
  it('routes a workflow to its read-only page', async () => {
    await renderAt('/agent-platform/workflows/deploy');
    expect(screen.getByText('Workflow page')).toBeInTheDocument();
  });

  it('hands the attached edit action to the workflow page', async () => {
    await renderAt('/agent-platform/workflows/deploy', {
      editAction: <button type="button">Edit via agent</button>,
    });
    expect(screen.getByText('Workflow page')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit via agent' }),
    ).toBeInTheDocument();
  });

  it("sends the index to the Customize screen's Workflows tab, keeping the query", async () => {
    await renderAt('/agent-platform/workflows?installation=gazelle');
    expect(
      await screen.findByText(
        'landed: /customize/workflows?installation=gazelle',
      ),
    ).toBeInTheDocument();
  });

  it('renders no list when the app binds no Customize page', async () => {
    await renderAt('/agent-platform/workflows', { withCustomize: false });
    expect(screen.queryByText(/landed:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Workflow page')).not.toBeInTheDocument();
  });
});
