import { Route, Routes, useLocation } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { agentsRouteRef } from '../../routes';
import { AgentsRedirect } from './AgentsRedirect';

const Landed = () => {
  const { pathname, search, hash } = useLocation();
  return <div data-testid="landed">{`${pathname}${search}${hash}`}</div>;
};

function renderAt(path: string, mounted = true) {
  return renderInTestApp(
    <Routes>
      <Route path="/agents/*" element={<AgentsRedirect />} />
      <Route path="/agent-platform/agents/*" element={<Landed />} />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: mounted
        ? { '/agent-platform/agents': agentsRouteRef }
        : undefined,
    },
  );
}

describe('AgentsRedirect', () => {
  it.each([
    ['/agents', '/agent-platform/agents'],
    ['/agents/', '/agent-platform/agents'],
    ['/agents/new/skills', '/agent-platform/agents/new/skills'],
    [
      '/agents/my-installation/default/my-agent/edit',
      '/agent-platform/agents/my-installation/default/my-agent/edit',
    ],
    [
      '/agents?installation=my-installation#top',
      '/agent-platform/agents?installation=my-installation#top',
    ],
  ])('forwards %s to %s', async (from, to) => {
    await renderAt(from);
    expect(await screen.findByTestId('landed')).toHaveTextContent(to);
  });

  it('stays a not-found page where the Agents tab is not mounted', async () => {
    await renderAt('/agents', false);
    expect(screen.queryByTestId('landed')).not.toBeInTheDocument();
  });
});
