import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { LegacyAgentPlatformRedirect } from './LegacyAgentPlatformRedirect';

let mockScope: { scope: string; home?: string; isLoading: boolean };

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ALL_INSTALLATIONS: 'all',
  useInstallationScope: () => mockScope,
}));

function Landed() {
  const { pathname, search, hash } = useLocation();
  return <p>{`landed: ${pathname}${search}${hash}`}</p>;
}

function renderAt(path: string) {
  return renderInTestApp(
    <Routes>
      <Route
        path="/agent-platform/*"
        element={<LegacyAgentPlatformRedirect />}
      />
      <Route path="/agents/*" element={<LegacyAgentPlatformRedirect />} />
      <Route path="*" element={<Landed />} />
    </Routes>,
    { initialRouteEntries: [path] },
  );
}

describe('LegacyAgentPlatformRedirect', () => {
  beforeEach(() => {
    mockScope = { scope: 'all', home: 'gazelle', isLoading: false };
  });

  it.each([
    ['/agent-platform', '/'],
    ['/agent-platform/sessions/gazelle/abc', '/sessions/gazelle/abc'],
    [
      '/agent-platform/agents/edit/gazelle/kagent/sre/tools',
      '/customize/agents/gazelle/kagent/sre/edit/tools',
    ],
    ['/agent-platform/usage/overview?window=7d', '/usage?window=7d'],
    ['/agent-platform/models/serving', '/customize/models/hosting'],
    ['/agents/new', '/customize/agents/new'],
    [
      '/agent-platform/connectors/jira?installation=golem&q=x',
      '/customize/connectors/golem/jira?q=x',
    ],
  ])('sends %s to %s in one hop', async (from, to) => {
    await renderAt(from);

    expect(await screen.findByText(`landed: ${to}`)).toBeInTheDocument();
  });

  it('keeps the hash', async () => {
    await renderAt('/agent-platform/profile#installations');

    expect(
      await screen.findByText('landed: /profile#installations'),
    ).toBeInTheDocument();
  });

  it('names the home installation where a connector link names none', async () => {
    await renderAt('/agent-platform/connectors/jira/tools/jira_search');

    expect(
      await screen.findByText(
        'landed: /customize/connectors/gazelle/jira/tools/jira_search',
      ),
    ).toBeInTheDocument();
  });

  it('names the pinned scope over the home installation', async () => {
    mockScope = { scope: 'golem', home: 'gazelle', isLoading: false };
    await renderAt('/agent-platform/workflows/deploy/run');

    expect(
      await screen.findByText('landed: /customize/workflows/golem/deploy/run'),
    ).toBeInTheDocument();
  });

  it('waits while the installations are read', async () => {
    mockScope = { scope: 'all', home: undefined, isLoading: true };
    await renderAt('/agent-platform/connectors/jira');

    expect(screen.queryByText(/^landed:/)).not.toBeInTheDocument();
  });
});
