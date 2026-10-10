import { QueryClient, type Query } from '@tanstack/react-query';

import {
  awaitsDeployedAgent,
  markAgentDeployed,
  PENDING_CREATION_WINDOW_MS,
} from './pendingAgentCreations';

const agent = { namespace: 'kagent', name: 'pr-reviewer' };

function agentsList(installation: string, items: unknown[] | undefined) {
  return {
    queryKey: ['cluster', installation, 'list', 'api.kagent.dev', 'v1alpha3'],
    state: { data: items },
  } as unknown as Query<any, any, any, any>;
}

describe('pending agent creations', () => {
  it('awaits a deployed agent the list does not show yet, within the window', () => {
    const queryClient = new QueryClient();
    markAgentDeployed(queryClient, 'gazelle', agent, 0);

    expect(
      awaitsDeployedAgent(queryClient, agentsList('gazelle', undefined), 1_000),
    ).toBe(true);
    expect(
      awaitsDeployedAgent(
        queryClient,
        agentsList('gazelle', [
          { metadata: { namespace: 'other', name: 'pr-reviewer' } },
        ]),
        1_000,
      ),
    ).toBe(true);
  });

  it('stops awaiting once the window has passed', () => {
    const queryClient = new QueryClient();
    markAgentDeployed(queryClient, 'gazelle', agent, 0);

    expect(
      awaitsDeployedAgent(
        queryClient,
        agentsList('gazelle', []),
        PENDING_CREATION_WINDOW_MS,
      ),
    ).toBe(false);
    // Dropped, not just skipped.
    expect(
      awaitsDeployedAgent(queryClient, agentsList('gazelle', []), 1_000),
    ).toBe(false);
  });

  it('keeps awaiting the agents not listed yet', () => {
    const queryClient = new QueryClient();
    markAgentDeployed(queryClient, 'gazelle', agent, 0);
    markAgentDeployed(
      queryClient,
      'gazelle',
      { namespace: 'kagent', name: 'triage' },
      0,
    );

    expect(
      awaitsDeployedAgent(
        queryClient,
        agentsList('gazelle', [{ metadata: agent }]),
        1_000,
      ),
    ).toBe(true);
    expect(
      awaitsDeployedAgent(
        queryClient,
        agentsList('gazelle', [
          { metadata: agent },
          { metadata: { namespace: 'kagent', name: 'triage' } },
        ]),
        1_000,
      ),
    ).toBe(false);
  });

  it('is scoped to the query client', () => {
    markAgentDeployed(new QueryClient(), 'gazelle', agent, 0);

    expect(
      awaitsDeployedAgent(new QueryClient(), agentsList('gazelle', []), 1_000),
    ).toBe(false);
  });
});
