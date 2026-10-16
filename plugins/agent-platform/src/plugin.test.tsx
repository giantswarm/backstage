import {
  createFrontendPlugin,
  FeatureFlagState,
} from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import {
  ShellPage,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';

import { AGENT_SHELL_FLAG } from '@giantswarm/backstage-plugin-agent-platform-common';
import { agentPlatformPlugin } from './plugin';

function RegistersHeaderAction() {
  const actions = useMemo(() => <button>Header action</button>, []);
  useProvidePageHeaderActions(actions);
  return <div>Sessions content</div>;
}

/** A view framing itself, as every view in the shell does. */
function SessionsView() {
  return (
    <ShellPage title="Sessions">
      <RegistersHeaderAction />
    </ShellPage>
  );
}

// The pages' own routers, stubbed: what is under test is whether the app
// routes them at all, and the frame the page puts around them.
jest.mock('./components/SessionsRouter', () => ({
  SessionsRouter: () => <SessionsView />,
}));
jest.mock('./components/AgentPlatformCookieAuth', () => ({
  AgentPlatformCookieAuth: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('./components/UsageRouter', () => ({
  UsageRouter: ({ sections }: { sections: unknown[] }) => (
    <div>Usage content, {sections.length} sections</div>
  ),
}));
jest.mock('./components/ProfilePage', () => ({
  ProfilePage: () => <div>Profile content</div>,
}));

function renderPages(
  agentShell: FeatureFlagState,
  path: string,
  extensions: Array<string | Record<string, boolean>> = [],
) {
  return renderTestApp({
    features: [
      createFrontendPlugin({
        pluginId: 'agent-platform',
        extensions: [
          agentPlatformPlugin.getExtension('page:agent-platform/sessions'),
          agentPlatformPlugin.getExtension('page:agent-platform/usage'),
          agentPlatformPlugin.getExtension('page:agent-platform/profile'),
        ],
      }),
    ],
    config: { app: { extensions } },
    initialRouteEntries: [path],
    apis: [
      mockApis.featureFlags({
        initialStates: { [AGENT_SHELL_FLAG]: agentShell },
      }),
    ],
  });
}

describe("the Agent Platform's own pages", () => {
  it.each([
    ['/sessions', 'Sessions content'],
    ['/sessions/gazelle/abc', 'Sessions content'],
    ['/usage', 'Usage content, 0 sections'],
    ['/usage/cost', 'Usage content, 0 sections'],
    ['/profile', 'Profile content'],
  ])('routes %s in the shell, enabled by default', async (path, content) => {
    renderPages(FeatureFlagState.Active, path);

    expect(await screen.findByText(content)).toBeInTheDocument();
  });

  it.each([
    ['/sessions', 'Sessions content'],
    ['/usage', 'Usage content, 0 sections'],
    ['/profile', 'Profile content'],
  ])('does not route %s without the shell', async (path, content) => {
    renderPages(FeatureFlagState.None, path, [
      'page:agent-platform/sessions',
      'page:agent-platform/usage',
      'page:agent-platform/profile',
    ]);

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
    expect(screen.queryByText(content)).not.toBeInTheDocument();
  });

  it('stays off where app.extensions disables it', async () => {
    renderPages(FeatureFlagState.Active, '/sessions', [
      { 'page:agent-platform/sessions': false },
    ]);

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });

  it('draws no header of its own and renders the view’s header actions', async () => {
    renderPages(FeatureFlagState.Active, '/sessions');

    expect(await screen.findByText('Sessions content')).toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent),
    ).toEqual(['Sessions']);
    expect(
      screen.getAllByRole('button', { name: 'Header action' }),
    ).toHaveLength(1);
  });

  it('names the page in the document title', async () => {
    // The shell's layout adds the suffix (`ShellDocumentTitleProvider`).
    renderPages(FeatureFlagState.Active, '/usage');

    await waitFor(() => expect(document.title).toBe('Usage'));
  });
});

/** Where an extension attaches; not on the public type, read for the test. */
function attachToOf(extension: object): unknown {
  return (extension as { attachTo?: unknown }).attachTo;
}

describe('the Customize tabs', () => {
  // The Customize page belongs to the app; the tabs reach it by its id, the
  // way muster's do.
  it.each([
    'sub-page:agent-platform/agents',
    'sub-page:agent-platform/skills',
    'sub-page:agent-platform/models',
  ] as const)('%s attaches to the Customize page', id => {
    expect(attachToOf(agentPlatformPlugin.getExtension(id))).toEqual({
      id: 'page:app/agent-shell-customize',
      input: 'pages',
    });
  });
});
