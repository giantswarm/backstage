import type { ReactNode } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
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

function renderAt(path: string) {
  return renderInTestApp(
    <Routes>
      <Route path="/agent-platform/sessions/*" element={<SessionsRouter />} />
    </Routes>,
    { initialRouteEntries: [path] },
  );
}

describe('SessionsRouter', () => {
  it('routes the list', async () => {
    await renderAt('/agent-platform/sessions');
    expect(screen.getByText('Sessions list')).toBeInTheDocument();
  });

  it('routes one session', async () => {
    await renderAt('/agent-platform/sessions/gazelle/abc');
    expect(screen.getByText('Session detail')).toBeInTheDocument();
  });
});
