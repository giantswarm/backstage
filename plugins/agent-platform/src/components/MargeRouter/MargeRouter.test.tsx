import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';

import { margeRouteRef } from '../../routes';
import { MargeRouter } from './MargeRouter';

const mockUseTeams = jest.fn();

jest.mock('../../hooks/useTeams', () => ({
  useTeams: () => mockUseTeams(),
}));

jest.mock('../MargePage', () => ({
  MargePage: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useParams } = require('react-router-dom');
    const { team } = useParams();
    return <div>bot-prs:{team}</div>;
  },
}));

jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

function renderTab(path: string) {
  return renderInTestApp(
    <Routes>
      <Route path="/agent-platform/marge/*" element={<MargeRouter />} />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/agent-platform/marge': margeRouteRef },
    },
  );
}

describe('MargeRouter', () => {
  it("lands the tab index on the person's own team", async () => {
    mockUseTeams.mockReturnValue({
      teams: ['bumblebee', 'atlas'],
      ownTeams: ['bumblebee'],
      defaultTeam: 'bumblebee',
      isLoading: false,
    });
    await renderTab('/agent-platform/marge');
    expect(await screen.findByText('bot-prs:bumblebee')).toBeInTheDocument();
  });

  it('falls back to the first catalogue team for a person without one', async () => {
    mockUseTeams.mockReturnValue({
      teams: ['atlas', 'bumblebee'],
      ownTeams: [],
      defaultTeam: undefined,
      isLoading: false,
    });
    await renderTab('/agent-platform/marge');
    expect(await screen.findByText('bot-prs:atlas')).toBeInTheDocument();
  });

  it('opens the team in the URL as it is', async () => {
    mockUseTeams.mockReturnValue({
      teams: [],
      ownTeams: [],
      defaultTeam: undefined,
      isLoading: false,
    });
    await renderTab('/agent-platform/marge/honeybadger');
    expect(await screen.findByText('bot-prs:honeybadger')).toBeInTheDocument();
  });
});
