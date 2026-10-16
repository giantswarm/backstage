import type { ReactElement, ReactNode } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { customizeExternalRouteRef, mcpServersRouteRef } from '../../routes';
import { McpServersRouter } from './McpServersRouter';

function mockPassThrough({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

jest.mock('../NewMcpServerFormProvider', () => ({
  NewMcpServerFormProvider: mockPassThrough,
}));
jest.mock('../NewMcpServerEditGate', () => ({
  NewMcpServerEditGate: mockPassThrough,
}));
jest.mock('../NewConnectorWizard', () => ({
  NewConnectorConnectPage: () => <p>Wizard connect</p>,
  NewConnectorSignInPage: () => <p>Wizard sign-in</p>,
  NewConnectorTestPage: () => <p>Wizard test</p>,
}));
jest.mock('../ConnectorPage', () => ({
  ConnectorPage: ({ usedBy }: { usedBy?: ReactNode }) => (
    <>
      <p>Connector page</p>
      {usedBy}
    </>
  ),
}));
jest.mock('../ToolPage', () => ({ ToolPage: () => <p>Tool page</p> }));

function renderAt(
  path: string,
  usedBy?: ReactElement,
  { withCustomize = true }: { withCustomize?: boolean } = {},
) {
  return renderInTestApp(
    <Routes>
      <Route
        path="/agent-platform/connectors/*"
        element={<McpServersRouter usedBy={usedBy} />}
      />
      <Route path="/customize/*" element={<p>Customize screen</p>} />
    </Routes>,
    {
      initialRouteEntries: [path],
      // The review redirect resolves its target through the route ref, the
      // list redirect through the app-bound Customize page.
      mountedRoutes: {
        '/agent-platform/connectors': mcpServersRouteRef,
        ...(withCustomize ? { '/customize': customizeExternalRouteRef } : {}),
      },
    },
  );
}

describe('McpServersRouter', () => {
  it.each([
    // The list is the Customize screen's Connectors tab.
    ['/agent-platform/connectors', 'Customize screen'],
    ['/agent-platform/connectors/new', 'Wizard connect'],
    ['/agent-platform/connectors/new/auth', 'Wizard sign-in'],
    // The wizard has no review step; its old address lands on Sign-in.
    ['/agent-platform/connectors/new/review', 'Wizard sign-in'],
    ['/agent-platform/connectors/new/verify', 'Wizard test'],
    ['/agent-platform/connectors/jira', 'Connector page'],
    ['/agent-platform/connectors/jira/used-by', 'Connector page'],
    ['/agent-platform/connectors/jira/tools/search', 'Tool page'],
  ])('routes %s', async (path, text) => {
    await renderAt(path);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('renders no list when the app binds no Customize page', async () => {
    await renderAt('/agent-platform/connectors', undefined, {
      withCustomize: false,
    });
    expect(screen.queryByText('Customize screen')).not.toBeInTheDocument();
    expect(screen.queryByText('Connector page')).not.toBeInTheDocument();
  });

  it('hands the attached Used by element to the connector page', async () => {
    await renderAt('/agent-platform/connectors/jira', <p>Agents using it</p>);
    expect(screen.getByText('Agents using it')).toBeInTheDocument();
  });
});
