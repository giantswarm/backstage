import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { AgentPlatformPageRoutes } from './AgentPlatformPageRoutes';

function renderAt(path: string) {
  return renderInTestApp(
    <Routes>
      <Route
        path="/agent-platform/*"
        element={
          <AgentPlatformPageRoutes
            pageTitle="Agent Platform"
            pages={[
              { path: 'sessions', title: 'Sessions', element: <p>sessions</p> },
              { path: 'agents', title: 'Agents', element: <p>agents</p> },
            ]}
          />
        }
      />
    </Routes>,
    { initialRouteEntries: [path] },
  );
}

describe('AgentPlatformPageRoutes', () => {
  it('leaves the sessions list to title itself', async () => {
    await renderAt('/agent-platform/sessions');

    expect(screen.getByText('sessions')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Sessions' }),
    ).not.toBeInTheDocument();
  });

  it('still heads one session with the sub-page title', async () => {
    await renderAt('/agent-platform/sessions/gazelle/abc');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Sessions' }),
    ).toBeInTheDocument();
  });

  it('heads any other sub-page with its title', async () => {
    await renderAt('/agent-platform/agents');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Agents' }),
    ).toBeInTheDocument();
  });
});
