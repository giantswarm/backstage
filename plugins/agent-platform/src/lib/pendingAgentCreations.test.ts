import type { Query } from '@tanstack/react-query';

import {
  awaitsDeployedAgent,
  markAgentDeployed,
  PENDING_CREATION_WINDOW_MS,
  PENDING_CREATIONS_STORAGE_KEY,
} from './pendingAgentCreations';

const agent = { namespace: 'kagent', name: 'pr-reviewer' };

function agentsList(installation: string, items: unknown[] | undefined) {
  return {
    queryKey: ['cluster', installation, 'list', 'api.kagent.dev', 'v1alpha3'],
    state: { data: items },
  } as unknown as Query<any, any, any, any>;
}

describe('pending agent creations', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('awaits a deployed agent the list does not show yet, on its installation only', () => {
    markAgentDeployed('gazelle', agent, 0);

    expect(awaitsDeployedAgent(agentsList('gazelle', undefined), 1_000)).toBe(
      true,
    );
    expect(
      awaitsDeployedAgent(
        agentsList('gazelle', [
          { metadata: { namespace: 'other', name: 'pr-reviewer' } },
        ]),
        1_000,
      ),
    ).toBe(true);
    expect(awaitsDeployedAgent(agentsList('glean', []), 1_000)).toBe(false);
  });

  it('survives a reload of the tab: the record is in sessionStorage', () => {
    markAgentDeployed('gazelle', agent, 0);

    expect(
      JSON.parse(window.sessionStorage.getItem(PENDING_CREATIONS_STORAGE_KEY)!),
    ).toEqual([{ installation: 'gazelle', ...agent, deployedAt: 0 }]);
  });

  it('stops awaiting once the window has passed, and drops the record', () => {
    markAgentDeployed('gazelle', agent, 0);

    expect(
      awaitsDeployedAgent(
        agentsList('gazelle', []),
        PENDING_CREATION_WINDOW_MS,
      ),
    ).toBe(false);
    expect(
      window.sessionStorage.getItem(PENDING_CREATIONS_STORAGE_KEY),
    ).toBeNull();
  });

  it('keeps awaiting the agents not listed yet', () => {
    markAgentDeployed('gazelle', agent, 0);
    markAgentDeployed('gazelle', { namespace: 'kagent', name: 'triage' }, 0);

    expect(
      awaitsDeployedAgent(agentsList('gazelle', [{ metadata: agent }]), 1_000),
    ).toBe(true);
    expect(
      awaitsDeployedAgent(
        agentsList('gazelle', [
          { metadata: agent },
          { metadata: { namespace: 'kagent', name: 'triage' } },
        ]),
        1_000,
      ),
    ).toBe(false);
  });

  it('awaits nothing when the stored record is unreadable', () => {
    window.sessionStorage.setItem(PENDING_CREATIONS_STORAGE_KEY, '{not json');

    expect(awaitsDeployedAgent(agentsList('gazelle', []), 1_000)).toBe(false);
  });
});
