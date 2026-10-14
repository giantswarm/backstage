import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { mcpServersRouteRef } from '../../routes';
import { ConnectorsRedirect } from './ConnectorsRedirect';

function Landed() {
  const { pathname, search, hash } = useLocation();
  return <p>landed: {`${pathname}${search}${hash}`}</p>;
}

async function renderAt(path: string) {
  await renderInTestApp(
    <Routes>
      <Route
        path="/agent-platform/mcp-servers/*"
        element={<ConnectorsRedirect />}
      />
      <Route path="/agent-platform/connectors/*" element={<Landed />} />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/agent-platform/connectors': mcpServersRouteRef },
    },
  );
}

describe('ConnectorsRedirect', () => {
  it('sends the old list address to the connectors tab', async () => {
    await renderAt('/agent-platform/mcp-servers');
    expect(
      await screen.findByText('landed: /agent-platform/connectors'),
    ).toBeInTheDocument();
  });

  it('keeps the path below the tab and the query, so shared links resolve', async () => {
    await renderAt(
      '/agent-platform/mcp-servers/kubernetes/details?installation=gazelle',
    );
    expect(
      await screen.findByText(
        'landed: /agent-platform/connectors/kubernetes/details?installation=gazelle',
      ),
    ).toBeInTheDocument();
  });
});
