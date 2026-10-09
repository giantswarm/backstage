import type { ReactNode } from 'react';
import { FeatureFlagState } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { AGENT_SHELL_FLAG } from '../../hooks/useAgentShell';
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

function renderAt(path: string, flag: FeatureFlagState) {
  return renderInTestApp(
    <Routes>
      <Route path="/agent-platform/sessions/*" element={<SessionsRouter />} />
    </Routes>,
    {
      initialRouteEntries: [path],
      apis: [
        mockApis.featureFlags({ initialStates: { [AGENT_SHELL_FLAG]: flag } }),
      ],
    },
  );
}

describe('SessionsRouter', () => {
  it.each([
    ['outside', FeatureFlagState.None],
    ['inside', FeatureFlagState.Active],
  ])('routes the list %s the shell', async (_, flag) => {
    await renderAt('/agent-platform/sessions', flag);
    expect(screen.getByText('Sessions list')).toBeInTheDocument();
  });

  it.each([
    ['outside', FeatureFlagState.None],
    ['inside', FeatureFlagState.Active],
  ])('routes one session %s the shell', async (_, flag) => {
    await renderAt('/agent-platform/sessions/gazelle/abc', flag);
    expect(screen.getByText('Session detail')).toBeInTheDocument();
  });
});
