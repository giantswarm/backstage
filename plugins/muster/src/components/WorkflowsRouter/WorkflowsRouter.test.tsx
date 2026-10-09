import { FeatureFlagState } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { AGENT_SHELL_FLAG } from '@giantswarm/backstage-plugin-agent-platform-common';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
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

function renderAt(path: string, flag: FeatureFlagState) {
  return renderInTestApp(
    <Routes>
      <Route path="/agent-platform/workflows/*" element={<WorkflowsRouter />} />
    </Routes>,
    {
      initialRouteEntries: [path],
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

  it.each([FeatureFlagState.None, FeatureFlagState.Active])(
    'keeps the list on the index (flag state %s)',
    async flag => {
      await renderAt('/agent-platform/workflows', flag);
      expect(screen.getByText('Workflows list')).toBeInTheDocument();
    },
  );
});
