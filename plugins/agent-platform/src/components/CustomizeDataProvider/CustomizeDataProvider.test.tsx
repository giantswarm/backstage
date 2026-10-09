import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import {
  CustomizeDataProvider,
  useCustomizeData,
} from './CustomizeDataProvider';

let mockAgentsLoading = false;
let mockModelsLoading = false;
let mockSkillsLoading = false;

jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../AgentsDataProvider', () => ({
  AgentsDataProvider: ({ children }: { children: ReactNode }) => children,
  useAgents: () => ({
    isLoading: mockAgentsLoading,
    rows: mockAgentsLoading
      ? []
      : [{ namespace: 'support' }, { namespace: 'engineering' }],
  }),
}));
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: ({ children }: { children: ReactNode }) => children,
  useModelConfigs: () => ({
    isLoading: mockModelsLoading,
    installations: ['golem'],
    modelConfigsFor: () =>
      mockModelsLoading
        ? []
        : [
            {
              cluster: 'golem',
              getNamespace: () => 'support',
              getName: () => 'sonnet',
              getDisplayName: () => 'Sonnet',
              getProvider: () => 'Anthropic',
              getModel: () => 'claude-sonnet-4-5',
              getEndpoint: () => undefined,
              getReadiness: () => 'accepted',
              getReadinessMessage: () => undefined,
              getAnthropic: () => undefined,
              getOpenAI: () => undefined,
              getOllama: () => undefined,
            },
          ],
  }),
}));
jest.mock('../ServingProvider', () => ({
  ServingProvider: ({ children }: { children: ReactNode }) => children,
  useServing: () => ({
    servingStateFor: () => undefined,
    capabilitiesFor: () => ({}),
    backends: {},
  }),
}));
jest.mock('../../hooks/useSkillCatalog', () => ({
  useSkillCatalog: () => ({
    skills: mockSkillsLoading ? [] : [{ name: 'triage' }],
    isLoading: mockSkillsLoading,
    error: null,
    hasRepositories: true,
    failedRepositories: [],
    truncated: false,
  }),
}));

function Probe() {
  const data = useCustomizeData();
  return (
    <pre data-testid="probe">
      {JSON.stringify({
        counts: data.counts,
        hasSkillRepositories: data.hasSkillRepositories,
        agentOrganizations: data.agentOrganizations,
        modelOrganizations: data.modelOrganizations,
      })}
    </pre>
  );
}

function read() {
  render(
    <CustomizeDataProvider>
      <Probe />
    </CustomizeDataProvider>,
  );
  return JSON.parse(screen.getByTestId('probe').textContent ?? '');
}

describe('CustomizeDataProvider', () => {
  beforeEach(() => {
    mockAgentsLoading = false;
    mockModelsLoading = false;
    mockSkillsLoading = false;
  });

  it('counts each tab and names the organizations', () => {
    expect(read()).toEqual({
      counts: { agents: 2, models: 1, skills: 1 },
      hasSkillRepositories: true,
      agentOrganizations: ['engineering', 'support'],
      modelOrganizations: ['support'],
    });
  });

  it('leaves out the counts still loading', () => {
    mockAgentsLoading = true;
    mockModelsLoading = true;
    mockSkillsLoading = true;
    expect(read()).toEqual({
      counts: {},
      agentOrganizations: [],
      modelOrganizations: [],
    });
  });
});
