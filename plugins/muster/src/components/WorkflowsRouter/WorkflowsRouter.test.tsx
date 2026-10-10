import { FeatureFlagState } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { AGENT_SHELL_FLAG } from '@giantswarm/backstage-plugin-agent-platform-common';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { customizeExternalRouteRef } from '../../routes';
import { WorkflowsRouter } from './WorkflowsRouter';

jest.mock('../WorkflowsListPage', () => ({
  WorkflowsListPage: () => <p>Workflows list</p>,
}));
jest.mock('../WorkflowDetailPage', () => ({
  WorkflowDetailPage: () => <p>Classic workflow detail</p>,
}));
jest.mock('../WorkflowPage', () => ({
  WorkflowPage: () => <p>Shell workflow page</p>,
}));

function Landed() {
  const { pathname, search } = useLocation();
  return <p>{`landed: ${pathname}${search}`}</p>;
}

function renderAt(
  path: string,
  flag: FeatureFlagState,
  { withCustomize = true }: { withCustomize?: boolean } = {},
) {
  return renderInTestApp(
    <Routes>
      <Route path="/agent-platform/workflows/*" element={<WorkflowsRouter />} />
      <Route path="/customize/*" element={<Landed />} />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: withCustomize
        ? { '/customize': customizeExternalRouteRef }
        : {},
      apis: [
        mockApis.featureFlags({ initialStates: { [AGENT_SHELL_FLAG]: flag } }),
      ],
    },
  );
}

describe('WorkflowsRouter', () => {
  it.each([
    [
      'the classic detail page outside the shell',
      FeatureFlagState.None,
      'Classic workflow detail',
    ],
    [
      'the read-only shell page inside the shell',
      FeatureFlagState.Active,
      'Shell workflow page',
    ],
  ])('routes a workflow to %s', async (_, flag, text) => {
    await renderAt('/agent-platform/workflows/deploy', flag);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('keeps the classic list on the index outside the shell', async () => {
    await renderAt('/agent-platform/workflows', FeatureFlagState.None);
    expect(screen.getByText('Workflows list')).toBeInTheDocument();
  });

  it("sends the index to the Customize screen's Workflows tab inside the shell, keeping the query", async () => {
    await renderAt(
      '/agent-platform/workflows?installation=gazelle',
      FeatureFlagState.Active,
    );
    expect(
      await screen.findByText(
        'landed: /customize/workflows?installation=gazelle',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Workflows list')).not.toBeInTheDocument();
  });

  it('keeps the classic list inside the shell when the app binds no Customize page', async () => {
    await renderAt('/agent-platform/workflows', FeatureFlagState.Active, {
      withCustomize: false,
    });
    expect(screen.getByText('Workflows list')).toBeInTheDocument();
  });
});
