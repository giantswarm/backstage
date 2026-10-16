import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { screen } from '@testing-library/react';
// The NFS test app: `useRouteRef` from `@backstage/frontend-plugin-api` resolves
// against the new route-resolution API, which the classic test app lacks.
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { agentsRouteRef } from '../../routes';
import { AgentsRouter } from './AgentsRouter';

// The pages are irrelevant here — this is about which route claims which URL —
// and stubbing them keeps the tree free of the kubernetes and muster reads they
// do.
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

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div>{`at ${pathname}${search}`}</div>;
}

function renderTab(path: string) {
  return renderInTestApp(
    <Routes>
      <Route path="/customize/agents" element={<LocationProbe />} />
      <Route path="/customize/agents/*" element={<AgentsRouter />} />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/customize/agents': agentsRouteRef },
    },
  );
}

const AGENT = '/customize/agents/gazelle/agent-platform/pr-reviewer';

describe('AgentsRouter', () => {
  it.each([
    [
      '/customize/agents/gazelle?installation=gazelle',
      '/customize/agents?installation=gazelle',
    ],
    ['/customize/agents/gazelle/agent-platform', '/customize/agents'],
  ])('sends %s, which names no agent, to the list', async (path, target) => {
    renderTab(path);

    expect(await screen.findByText(`at ${target}`)).toBeInTheDocument();
  });

  it('routes an agent page', async () => {
    renderTab(AGENT);

    expect(await screen.findByText('agent-detail')).toBeInTheDocument();
  });

  // The detail page is mounted at a splat because it is tabbed, so every URL
  // under an agent reaches it — including the ones its own router turns into
  // tabs.
  it.each(['', '/tools', '/usage', '/sessions'])(
    'renders the detail page at the agent URL + "%s"',
    async tab => {
      renderTab(`${AGENT}${tab}`);

      expect(await screen.findByText('agent-detail')).toBeInTheDocument();
    },
  );

  // The edit wizard and its steps end in the static `edit` segment, which
  // react-router scores above the detail page's splat — if that ever stopped
  // holding, `edit` would read as one of the agent's tabs.
  it.each(['', '/skills', '/tools', '/review'])(
    'renders the edit wizard at <agent>/edit + "%s"',
    async step => {
      renderTab(`${AGENT}/edit${step}`);

      expect(await screen.findByText('agent-edit')).toBeInTheDocument();
      expect(screen.queryByText('agent-detail')).not.toBeInTheDocument();
    },
  );

  // Two segments, so the create flow can never be read as an agent's
  // installation/namespace/name.
  it.each([
    ['/new', 'new-agent'],
    ['/new/skills', 'new-agent-skills'],
    ['/new/tools', 'new-agent-tools'],
    ['/new/review', 'new-agent-review'],
  ])('renders the create flow at "%s"', async (path, text) => {
    renderTab(`/customize/agents${path}`);

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it.each([
    '/customize/agents/new/whatever',
    // Deeper still: never an agent on an installation named `new`.
    '/customize/agents/new/review/x',
    '/customize/agents/new/skills/extra/more',
    '/customize/agents/new/a/b/edit/tools',
  ])('sends %s to the first create step', async path => {
    renderTab(path);

    expect(await screen.findByText('new-agent')).toBeInTheDocument();
    expect(screen.queryByText('agent-detail')).not.toBeInTheDocument();
    expect(screen.queryByText('agent-edit')).not.toBeInTheDocument();
  });
});
