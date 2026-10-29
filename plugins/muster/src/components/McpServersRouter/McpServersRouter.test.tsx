import type { ReactElement, ReactNode } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { mcpServersRouteRef } from '../../routes';
import { McpServersRouter } from './McpServersRouter';

function mockPassThrough({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

jest.mock('../NewMcpServerFormProvider', () => ({
  NewMcpServerFormProvider: mockPassThrough,
}));
jest.mock('../NewMcpServerEditGate', () => ({
  ...jest.requireActual('../NewMcpServerEditGate'),
  NewMcpServerEditGate: mockPassThrough,
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
      <p>Providers on {installation ?? 'the scope'}</p>
      {children}
    </>
  ),
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

function Where() {
  return <p>At {useLocation().pathname}</p>;
}

function renderAt(path: string, usedBy?: ReactElement) {
  return renderInTestApp(
    <Routes>
      <Route path="/customize/connectors" element={<Where />} />
      <Route
        path="/customize/connectors/*"
        element={
          <>
            <Where />
            <McpServersRouter usedBy={usedBy} />
          </>
        }
      />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/customize/connectors': mcpServersRouteRef },
    },
  );
}

describe('McpServersRouter', () => {
  it.each([
    ['/customize/connectors/new', 'Wizard connect', 'the scope'],
    ['/customize/connectors/new/auth', 'Wizard sign-in', 'the scope'],
    ['/customize/connectors/new/verify', 'Wizard test', 'the scope'],
    ['/customize/connectors/alpha/jira', 'Connector page', 'alpha'],
    ['/customize/connectors/alpha/jira/used-by', 'Connector page', 'alpha'],
    ['/customize/connectors/alpha/jira/tools/search', 'Tool page', 'alpha'],
    ['/customize/connectors/alpha/jira/edit', 'Wizard connect', 'alpha'],
    ['/customize/connectors/alpha/jira/edit/auth', 'Wizard sign-in', 'alpha'],
    ['/customize/connectors/alpha/jira/edit/verify', 'Wizard test', 'alpha'],
  ])('routes %s', async (path, text, installation) => {
    await renderAt(path);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(
      screen.getByText(`Providers on ${installation}`),
    ).toBeInTheDocument();
  });

  it.each([
    // An unknown step: the wizard's first.
    ['/customize/connectors/new/review', '/customize/connectors/new'],
    [
      '/customize/connectors/alpha/jira/edit/x',
      '/customize/connectors/alpha/jira/edit',
    ],
    // An installation alone names no page: the list.
    ['/customize/connectors/alpha', '/customize/connectors'],
  ])('redirects %s to its nearest valid parent', async (path, target) => {
    await renderAt(path);
    expect(await screen.findByText(`At ${target}`)).toBeInTheDocument();
  });

  it('hands the attached Used by element to the connector page', async () => {
    await renderAt('/customize/connectors/alpha/jira', <p>Agents using it</p>);
    expect(screen.getByText('Agents using it')).toBeInTheDocument();
  });
});
