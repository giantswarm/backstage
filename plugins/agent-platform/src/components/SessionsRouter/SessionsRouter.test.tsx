import type { ReactNode } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { sessionsRouteRef } from '../../routes';
import { SessionsRouter } from './SessionsRouter';

function mockPassThrough({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: mockPassThrough,
}));
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: mockPassThrough,
}));
jest.mock('../ServingProvider', () => ({ ServingProvider: mockPassThrough }));
jest.mock('../AgentsDataProvider', () => ({
  AgentsDataProvider: mockPassThrough,
}));
// What an Environment selector on a Customize page pinned. The scope hook
// honours `AllInstallationsScope` as the real one does (gs pins that contract).
jest.mock('@giantswarm/backstage-plugin-gs', () => {
  const { createContext, createElement, useContext } =
    jest.requireActual<typeof import('react')>('react');
  const AllScope = createContext(false);
  return {
    AllInstallationsScope: ({ children }: { children: ReactNode }) =>
      createElement(AllScope.Provider, { value: true }, children),
    useInstallationScope: () => ({
      scope: useContext(AllScope) ? 'all' : 'wombat',
    }),
  };
});

jest.mock('../SessionsIndexPage', () => {
  const { useInstallationScope } = jest.requireMock(
    '@giantswarm/backstage-plugin-gs',
  );
  return {
    SessionsIndexPage: () => (
      <p>Sessions list of {useInstallationScope().scope}</p>
    ),
  };
});
jest.mock('./SessionDetailRoute', () => ({
  SessionDetailRoute: () => <p>Session detail</p>,
}));

function Where() {
  return <p>At {useLocation().pathname}</p>;
}

function renderAt(path: string) {
  return renderInTestApp(
    <Routes>
      <Route
        path="/sessions/*"
        element={
          <>
            <Where />
            <SessionsRouter />
          </>
        }
      />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/sessions': sessionsRouteRef },
    },
  );
}

describe('SessionsRouter', () => {
  it('routes the list', async () => {
    await renderAt('/sessions');
    expect(screen.getByText(/^Sessions list/)).toBeInTheDocument();
  });

  it('reads every environment, whatever a Customize page pinned', async () => {
    await renderAt('/sessions?installation=wombat');
    expect(screen.getByText('Sessions list of all')).toBeInTheDocument();
  });

  it('routes one session', async () => {
    await renderAt('/sessions/gazelle/abc');
    expect(screen.getByText('Session detail')).toBeInTheDocument();
  });

  it.each(['/sessions/gazelle', '/sessions/gazelle/abc/deeper'])(
    'sends %s, which names no session, to the list',
    async path => {
      await renderAt(path);
      expect(await screen.findByText(/^Sessions list/)).toBeInTheDocument();
      expect(screen.getByText('At /sessions')).toBeInTheDocument();
    },
  );
});
