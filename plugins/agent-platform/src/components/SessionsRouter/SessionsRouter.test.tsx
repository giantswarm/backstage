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
jest.mock('../SessionsIndexPage', () => ({
  SessionsIndexPage: () => <p>Sessions list</p>,
}));
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
    expect(screen.getByText('Sessions list')).toBeInTheDocument();
  });

  it('routes one session', async () => {
    await renderAt('/sessions/gazelle/abc');
    expect(screen.getByText('Session detail')).toBeInTheDocument();
  });

  it.each(['/sessions/gazelle', '/sessions/gazelle/abc/deeper'])(
    'sends %s, which names no session, to the list',
    async path => {
      await renderAt(path);
      expect(await screen.findByText('Sessions list')).toBeInTheDocument();
      expect(screen.getByText('At /sessions')).toBeInTheDocument();
    },
  );
});
