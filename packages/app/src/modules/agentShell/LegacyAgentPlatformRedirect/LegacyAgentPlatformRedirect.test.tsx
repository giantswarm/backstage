import type { ReactNode } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { LegacyAgentPlatformRedirect } from './LegacyAgentPlatformRedirect';

/** muster's active installation, as the old pages resolved it. */
let mockMuster: {
  activeInstallation?: string;
  isLoadingInstallations: boolean;
};
const mockProviderMounted = jest.fn();

jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  CustomizeMusterProvider: ({ children }: { children: ReactNode }) => {
    mockProviderMounted();
    return <>{children}</>;
  },
  useMusterInstance: () => mockMuster,
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
    mockMuster = {
      activeInstallation: 'gazelle',
      isLoadingInstallations: false,
    };
    mockProviderMounted.mockClear();
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
  ])('sends %s to %s in one hop, without waiting', async (from, to) => {
    // Even while muster's installations are still being read: these
    // addresses do not need them.
    mockMuster = { isLoadingInstallations: true };
    await renderAt(from);

    expect(await screen.findByText(`landed: ${to}`)).toBeInTheDocument();
    expect(mockProviderMounted).not.toHaveBeenCalled();
  });

  it('keeps the hash', async () => {
    await renderAt('/agent-platform/profile#installations');

    expect(
      await screen.findByText('landed: /profile#installations'),
    ).toBeInTheDocument();
  });

  it("names muster's active installation where a connector link names none", async () => {
    mockMuster = { activeInstallation: 'golem', isLoadingInstallations: false };
    await renderAt('/agent-platform/connectors/jira/tools/jira_search');

    expect(
      await screen.findByText(
        'landed: /customize/connectors/golem/jira/tools/jira_search',
      ),
    ).toBeInTheDocument();
  });

  it('waits while muster’s installations are read', async () => {
    mockMuster = { isLoadingInstallations: true };
    await renderAt('/agent-platform/workflows/deploy/run');

    expect(screen.queryByText(/^landed:/)).not.toBeInTheDocument();
  });

  it.each([
    [
      '/agent-platform/connectors/jira/tools/jira_search',
      '/customize/connectors',
    ],
    ['/agent-platform/workflows/deploy/run', '/customize/workflows'],
  ])(
    'lands %s on its list where no installation runs muster',
    async (from, to) => {
      mockMuster = {
        activeInstallation: undefined,
        isLoadingInstallations: false,
      };
      await renderAt(from);

      expect(await screen.findByText(`landed: ${to}`)).toBeInTheDocument();
    },
  );
});
