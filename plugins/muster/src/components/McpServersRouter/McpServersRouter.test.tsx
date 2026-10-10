import type { ReactElement, ReactNode } from 'react';
import { FeatureFlagState } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { AGENT_SHELL_FLAG } from '@giantswarm/backstage-plugin-agent-platform-common';
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
jest.mock('../NewConnectorWizard', () => ({
  NewConnectorConnectPage: () => <p>Shell wizard connect</p>,
  NewConnectorSignInPage: () => <p>Shell wizard sign-in</p>,
  NewConnectorTestPage: () => <p>Shell wizard test</p>,
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

function renderAt(
  path: string,
  flag: FeatureFlagState,
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
      // The shell review redirect resolves its target through the route ref,
      // the shell list redirect through the app-bound Customize page.
      mountedRoutes: {
        '/agent-platform/connectors': mcpServersRouteRef,
        ...(withCustomize ? { '/customize': customizeExternalRouteRef } : {}),
      },
      apis: [
        mockApis.featureFlags({ initialStates: { [AGENT_SHELL_FLAG]: flag } }),
      ],
    },
  );
}

describe('McpServersRouter', () => {
  describe.each([
    [
      'outside the shell',
      FeatureFlagState.None,
      {
        list: 'Servers list',
        server: 'Server page',
        connect: 'Wizard',
        auth: 'Wizard auth',
        review: 'Wizard review',
        verify: 'Wizard verify',
      },
    ],
    [
      'inside the shell',
      FeatureFlagState.Active,
      {
        // The shell's list is the Customize screen's Connectors tab.
        list: 'Customize screen',
        server: 'Connector page',
        connect: 'Shell wizard connect',
        auth: 'Shell wizard sign-in',
        // The shell wizard has no review step; its address lands on Sign-in.
        review: 'Shell wizard sign-in',
        verify: 'Shell wizard test',
      },
    ],
  ])('%s', (_, flag, pages) => {
    it.each([
      ['/agent-platform/connectors', pages.list],
      ['/agent-platform/connectors/new', pages.connect],
      ['/agent-platform/connectors/new/auth', pages.auth],
      ['/agent-platform/connectors/new/review', pages.review],
      ['/agent-platform/connectors/new/verify', pages.verify],
      ['/agent-platform/connectors/jira', pages.server],
      ['/agent-platform/connectors/jira/used-by', pages.server],
      ['/agent-platform/connectors/jira/settings', pages.server],
      ['/agent-platform/connectors/jira/tools/search', 'Tool page'],
    ])('routes %s', async (path, text) => {
      await renderAt(path, flag);
      expect(await screen.findByText(text)).toBeInTheDocument();
    });
  });

  it('keeps the classic list inside the shell when the app binds no Customize page', async () => {
    await renderAt(
      '/agent-platform/connectors',
      FeatureFlagState.Active,
      undefined,
      {
        withCustomize: false,
      },
    );
    expect(await screen.findByText('Servers list')).toBeInTheDocument();
  });

  it('hands the attached Used by element to the shell connector page only', async () => {
    await renderAt(
      '/agent-platform/connectors/jira',
      FeatureFlagState.Active,
      <p>Agents using it</p>,
    );
    expect(screen.getByText('Agents using it')).toBeInTheDocument();

    await renderAt(
      '/agent-platform/connectors/jira',
      FeatureFlagState.None,
      <p>Agents using it too</p>,
    );
    expect(screen.queryByText('Agents using it too')).not.toBeInTheDocument();
  });
});
