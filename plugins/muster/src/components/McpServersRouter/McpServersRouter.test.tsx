import type { ReactElement, ReactNode } from 'react';
import { FeatureFlagState } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { AGENT_SHELL_FLAG } from '@giantswarm/backstage-plugin-agent-platform-common';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
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
jest.mock('../McpServersPage', () => ({
  McpServersPage: () => <p>Servers list</p>,
}));
jest.mock('../NewMcpServerPage', () => ({
  NewMcpServerPage: () => <p>Wizard</p>,
}));
jest.mock('../NewMcpServerAuthPage', () => ({
  NewMcpServerAuthPage: () => <p>Wizard auth</p>,
}));
jest.mock('../NewMcpServerReviewPage', () => ({
  NewMcpServerReviewPage: () => <p>Wizard review</p>,
}));
jest.mock('../NewMcpServerVerifyPage', () => ({
  NewMcpServerVerifyPage: () => <p>Wizard verify</p>,
}));
jest.mock('../ServerPage', () => ({
  ServerPage: () => <p>Server page</p>,
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

function renderAt(path: string, flag: FeatureFlagState, usedBy?: ReactElement) {
  return renderInTestApp(
    <Routes>
      <Route
        path="/agent-platform/mcp-servers/*"
        element={<McpServersRouter usedBy={usedBy} />}
      />
    </Routes>,
    {
      initialRouteEntries: [path],
      apis: [
        mockApis.featureFlags({ initialStates: { [AGENT_SHELL_FLAG]: flag } }),
      ],
    },
  );
}

describe('McpServersRouter', () => {
  describe.each([
    ['outside the shell', FeatureFlagState.None, 'Server page'],
    ['inside the shell', FeatureFlagState.Active, 'Connector page'],
  ])('%s', (_, flag, serverPage) => {
    it.each([
      ['/agent-platform/mcp-servers', 'Servers list'],
      ['/agent-platform/mcp-servers/new', 'Wizard'],
      ['/agent-platform/mcp-servers/new/verify', 'Wizard verify'],
      ['/agent-platform/mcp-servers/jira', serverPage],
      ['/agent-platform/mcp-servers/jira/used-by', serverPage],
      ['/agent-platform/mcp-servers/jira/settings', serverPage],
      ['/agent-platform/mcp-servers/jira/tools/search', 'Tool page'],
    ])('routes %s', async (path, text) => {
      await renderAt(path, flag);
      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });

  it('hands the attached Used by element to the shell connector page only', async () => {
    await renderAt(
      '/agent-platform/mcp-servers/jira',
      FeatureFlagState.Active,
      <p>Agents using it</p>,
    );
    expect(screen.getByText('Agents using it')).toBeInTheDocument();

    await renderAt(
      '/agent-platform/mcp-servers/jira',
      FeatureFlagState.None,
      <p>Agents using it too</p>,
    );
    expect(screen.queryByText('Agents using it too')).not.toBeInTheDocument();
  });
});
