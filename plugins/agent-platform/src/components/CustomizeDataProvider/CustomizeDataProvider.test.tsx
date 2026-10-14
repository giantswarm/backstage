import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import {
  CustomizeDataProvider,
  useCustomizeData,
} from './CustomizeDataProvider';

let mockAgentsLoading = false;
let mockModelsLoading = false;
let mockSkillsLoading = false;
let mockWorkspacesLoading = false;

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
              isStale: () => false,
              getAnthropic: () => undefined,
              getOpenAI: () => undefined,
              getOllama: () => undefined,
            },
          ],
  }),
}));
jest.mock('../WorkspacesDataProvider', () => ({
  WorkspacesDataProvider: ({ children }: { children: ReactNode }) => children,
  useWorkspacesData: () =>
    mockWorkspacesLoading
      ? { isAvailable: undefined, isLoading: true, rows: [] }
      : { isAvailable: true, isLoading: false, rows: [{}, {}, {}] },
}));
jest.mock('../ServingProvider', () => ({
  ServingProvider: ({ children }: { children: ReactNode }) => children,
  useServing: () => ({
    servingStateFor: () => undefined,
    capabilitiesFor: () => ({}),
    backends: {},
  }),
}));
const SKILLS = 'https://github.com/giantswarm/skills';
let mockSkills: { name: string; repoUrl: string; path: string }[] = [];
let mockFailedRepositories: string[] = [];
jest.mock('../../hooks/useSkillCatalog', () => ({
  useSkillCatalog: () => ({
    skills: mockSkillsLoading ? [] : mockSkills,
    isLoading: mockSkillsLoading,
    error: null,
    hasRepositories: true,
    failedRepositories: mockFailedRepositories,
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
        hasWorkspaces: data.hasWorkspaces,
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
    mockWorkspacesLoading = false;
    mockSkills = [{ name: 'triage', repoUrl: SKILLS, path: 'triage' }];
    mockFailedRepositories = [];
  });

  it('counts each tab', () => {
    expect(read()).toEqual({
      counts: { agents: 2, models: 1, skills: 1, workspaces: 3 },
      hasSkillRepositories: true,
      hasWorkspaces: true,
    });
  });

  it('counts a skill once, however its repository is written', () => {
    mockSkills = [
      { name: 'triage', repoUrl: SKILLS, path: 'triage' },
      { name: 'triage', repoUrl: `${SKILLS}.git`, path: 'triage' },
      { name: 'notes', repoUrl: SKILLS, path: 'notes' },
    ];
    expect(read().counts.skills).toBe(2);
  });

  it('leaves the skills count out when no repository could be read', () => {
    mockSkills = [];
    mockFailedRepositories = [SKILLS];
    expect(read().counts.skills).toBeUndefined();
  });

  it('leaves out the counts still loading', () => {
    mockAgentsLoading = true;
    mockModelsLoading = true;
    mockSkillsLoading = true;
    mockWorkspacesLoading = true;
    expect(read()).toEqual({ counts: {} });
  });
});
