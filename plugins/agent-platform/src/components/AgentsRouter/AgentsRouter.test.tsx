import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
// The NFS test app: `useRouteRef` from `@backstage/frontend-plugin-api` resolves
// against the new route-resolution API, which the classic test app lacks.
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { agentsRouteRef } from '../../routes';
import { AgentsRouter } from './AgentsRouter';

// The pages are irrelevant here — this is about which route claims which URL —
// and stubbing them keeps the tree free of the kubernetes and muster reads they
// do.
jest.mock('../AgentsIndexPage', () => ({
  AgentsIndexPage: () => <div>agents-index</div>,
}));
jest.mock('../AgentDetailPage', () => ({
  AgentDetailPage: () => <div>agent-detail</div>,
}));
jest.mock('../EditAgentPage', () => ({
  EditAgentPage: () => <div>agent-edit</div>,
}));
jest.mock('../NewAgentPage', () => ({
  NewAgentPage: () => <div>new-agent</div>,
}));
jest.mock('../NewAgentSkillsPage', () => ({
  NewAgentSkillsPage: () => <div>new-agent-skills</div>,
}));
jest.mock('../NewAgentToolsPage', () => ({
  NewAgentToolsPage: () => <div>new-agent-tools</div>,
}));
jest.mock('../NewAgentReviewPage', () => ({
  NewAgentReviewPage: () => <div>new-agent-review</div>,
}));

// Pass-throughs: the create flow's shared form state and the plugin's query
// client have nothing to do with route ranking.
jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('../NewAgentFormProvider', () => ({
  NewAgentFormProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

function renderTab(path: string) {
  return renderInTestApp(
    <Routes>
      <Route path="/agent-platform/agents/*" element={<AgentsRouter />} />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/agent-platform/agents': agentsRouteRef },
    },
  );
}

const AGENT = '/agent-platform/agents/gazelle/agent-platform/pr-reviewer';

describe('AgentsRouter', () => {
  it('renders the list at the tab index', async () => {
    renderTab('/agent-platform/agents');

    expect(await screen.findByText('agents-index')).toBeInTheDocument();
  });

  // The detail page is mounted at a splat because it is tabbed, so every URL
  // under an agent reaches it — including the ones its own router turns into
  // tabs.
  it.each(['', '/tools', '/skills', '/sessions'])(
    'renders the detail page at the agent URL + "%s"',
    async tab => {
      renderTab(`${AGENT}${tab}`);

      expect(await screen.findByText('agent-detail')).toBeInTheDocument();
    },
  );

  // The one ranking this change puts at risk: `edit` is a static segment beside
  // the detail page's splat, and react-router scores it higher. If that ever
  // stopped holding, Edit would silently become the detail page's Overview tab.
  it('keeps the edit page ahead of the detail page’s splat', async () => {
    renderTab(`${AGENT}/edit`);

    expect(await screen.findByText('agent-edit')).toBeInTheDocument();
    expect(screen.queryByText('agent-detail')).not.toBeInTheDocument();
  });

  // Two segments, so the create flow can never be read as an agent's
  // installation/namespace/name.
  it.each([
    ['/new', 'new-agent'],
    ['/new/skills', 'new-agent-skills'],
    ['/new/tools', 'new-agent-tools'],
    ['/new/review', 'new-agent-review'],
  ])('renders the create flow at "%s"', async (path, text) => {
    renderTab(`/agent-platform/agents${path}`);

    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});
