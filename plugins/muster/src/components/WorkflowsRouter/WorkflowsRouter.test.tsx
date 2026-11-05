import type { ReactElement, ReactNode } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { workflowsRouteRef } from '../../routes';
import { WorkflowsRouter } from './WorkflowsRouter';

jest.mock('../WorkflowPage', () => ({
  WorkflowPage: ({ editAction }: { editAction?: ReactElement }) => (
    <div>
      <p>Workflow page</p>
      {editAction}
    </div>
  ),
}));
jest.mock('../MusterSubPage', () => ({
  MusterSubPage: ({
    installation,
    children,
  }: {
    installation?: string;
    children: ReactNode;
  }) => (
    <>
      <p>Providers on {installation}</p>
      {children}
    </>
  ),
}));

function Landed() {
  const { pathname, search } = useLocation();
  return <p>{`landed: ${pathname}${search}`}</p>;
}

function renderAt(path: string, editAction?: ReactElement) {
  return renderInTestApp(
    <Routes>
      <Route path="/customize/workflows" element={<Landed />} />
      <Route
        path="/customize/workflows/*"
        element={<WorkflowsRouter editAction={editAction} />}
      />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/customize/workflows': workflowsRouteRef },
    },
  );
}

describe('WorkflowsRouter', () => {
  it.each([
    '/customize/workflows/gazelle/deploy',
    '/customize/workflows/gazelle/deploy/run',
  ])('routes %s to the workflow page, on its installation', async path => {
    await renderAt(path);
    expect(screen.getByText('Workflow page')).toBeInTheDocument();
    expect(screen.getByText('Providers on gazelle')).toBeInTheDocument();
  });

  it('hands the attached edit action to the workflow page', async () => {
    await renderAt(
      '/customize/workflows/gazelle/deploy',
      <button type="button">Edit via agent</button>,
    );
    expect(screen.getByText('Workflow page')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit via agent' }),
    ).toBeInTheDocument();
  });

  it('sends an address without a workflow to the list, its nearest valid parent', async () => {
    await renderAt('/customize/workflows/gazelle');
    expect(
      await screen.findByText('landed: /customize/workflows'),
    ).toBeInTheDocument();
  });
});
