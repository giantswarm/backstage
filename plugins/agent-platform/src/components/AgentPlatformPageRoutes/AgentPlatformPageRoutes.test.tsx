import { useMemo } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import {
  ShellPage,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';
import { AgentPlatformPageRoutes } from './AgentPlatformPageRoutes';

/** Routed content registering an action into the page header's slot. */
function RegistersAction({ label }: { label: string }) {
  const action = useMemo(() => <button type="button">{label}</button>, [label]);
  useProvidePageHeaderActions(action);
  return null;
}

/** The sessions sub-page: a self-titled list, and a session still loading. */
function SessionsSubPage() {
  return (
    <Routes>
      <Route
        index
        element={
          <ShellPage
            title="Sessions"
            actions={<button type="button">New session</button>}
          >
            <RegistersAction label="Refresh" />
          </ShellPage>
        }
      />
      <Route path=":installation/:id" element={<p>one session</p>} />
    </Routes>
  );
}

/** The connectors sub-page: a list, and a self-titled connector. */
function ConnectorsSubPage() {
  return (
    <Routes>
      <Route index element={<p>connectors</p>} />
      <Route
        path=":server/*"
        element={
          <ShellPage
            title="github"
            actions={<button type="button">Edit</button>}
          >
            <RegistersAction label="Remove" />
          </ShellPage>
        }
      />
    </Routes>
  );
}

function renderAt(path: string) {
  return renderInTestApp(
    <Routes>
      <Route
        path="/agent-platform/*"
        element={
          <AgentPlatformPageRoutes
            pageTitle="Agent Platform"
            pages={[
              {
                path: 'sessions',
                title: 'Sessions',
                element: <SessionsSubPage />,
              },
              { path: 'agents', title: 'Agents', element: <p>agents</p> },
              {
                path: 'mcp-servers',
                title: 'MCP Servers',
                element: <ConnectorsSubPage />,
              },
            ]}
          />
        }
      />
    </Routes>,
    { initialRouteEntries: [path] },
  );
}

describe('AgentPlatformPageRoutes', () => {
  it('leaves the sessions list one h1 and each action once', async () => {
    await renderAt('/agent-platform/sessions');

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Sessions' }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: /New session/ })).toHaveLength(
      0,
    );
    expect(screen.getAllByRole('button', { name: 'New session' })).toHaveLength(
      1,
    );
    expect(screen.getAllByRole('button', { name: 'Refresh' })).toHaveLength(1);
  });

  it('leaves the connector page one h1 and each action once', async () => {
    await renderAt('/agent-platform/mcp-servers/github/used-by');

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'github' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
  });

  it('draws no header of its own over a view that has none yet', async () => {
    // A view whose code, cookie or data is still loading: an empty content
    // area, not the section's list header standing in for the page.
    await renderAt('/agent-platform/sessions/gazelle/abc');

    expect(screen.getByText('one session')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('names the sub-page in the document title', async () => {
    await renderAt('/agent-platform/agents');

    await waitFor(() => expect(document.title).toBe('Agents · Agent Platform'));
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
});
