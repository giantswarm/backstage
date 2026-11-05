import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import {
  CustomizeDataProvider,
  useCustomizeData,
} from './CustomizeDataProvider';

let mockAgentsLoading = false;
let mockAgentsLoadingMore = false;
let mockUnreachable: string[] = [];
let mockModelsLoading = false;
/** Some installations' models are in, others are still read. */
let mockModelsPartial = false;
let mockSkillsLoading = false;
let mockWorkspacesLoading = false;
let mockWorkspaceFailures: Record<string, string> = {};

jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../AgentsDataProvider', () => ({
  AgentsDataProvider: ({ children }: { children: ReactNode }) => children,
  useAgents: () => ({
    isLoading: mockAgentsLoading,
    isLoadingMore: mockAgentsLoadingMore,
    unreachableInstallations: mockUnreachable,
    rows: mockAgentsLoading
      ? []
      : [{ namespace: 'support' }, { namespace: 'engineering' }],
  }),
}));
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: ({ children }: { children: ReactNode }) => children,
  useModelConfigs: () => ({
    isLoading: mockModelsLoading || mockModelsPartial,
    installations: ['golem'],
    modelConfigsFor: () =>
      mockModelsLoading
        ? []
        : [
            {
              cluster: 'golem',
              getNamespace: () => 'support',
              getName: () => 'sonnet',
              getAnnotations: () => undefined,
              getDisplayName: () => 'Sonnet',
              getProvider: () => 'Anthropic',
              getModel: () => 'claude-sonnet-4-5',
              getEndpoint: () => undefined,
              getReadiness: () => 'accepted',
              getReadinessMessage: () => undefined,
              getFailedCondition: () => undefined,
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
      ? {
          isAvailable: undefined,
          isLoading: true,
          rows: [],
          totalCount: 'loading',
          failures: {},
        }
      : {
          isAvailable: true,
          isLoading: false,
          // The picked Organization's three, of five in all.
          rows: Object.keys(mockWorkspaceFailures).length ? [] : [{}, {}, {}],
          totalCount: Object.keys(mockWorkspaceFailures).length ? undefined : 5,
          failures: mockWorkspaceFailures,
        },
}));
jest.mock('../../hooks/useToolchainManager', () => ({
  useScopedToolchainInstallations: () => ({
    installations: ['gazelle'],
    hasToolchains: true,
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

function SettledProbe() {
  const { settledCounts } = useCustomizeData();
  return <pre data-testid="settled">{JSON.stringify(settledCounts)}</pre>;
}

function readSettled() {
  render(
    <CustomizeDataProvider>
      <SettledProbe />
    </CustomizeDataProvider>,
  );
  return JSON.parse(screen.getByTestId('settled').textContent ?? '');
}

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
    mockAgentsLoadingMore = false;
    mockUnreachable = [];
    mockModelsLoading = false;
    mockModelsPartial = false;
    mockSkillsLoading = false;
    mockWorkspacesLoading = false;
    mockSkills = [{ name: 'triage', repoUrl: SKILLS, path: 'triage' }];
    mockFailedRepositories = [];
    mockWorkspaceFailures = {};
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

  it('leaves the workspaces count out when none could be read', () => {
    mockWorkspaceFailures = {
      golem:
        "auth_required: server 'workspace-manager' requires authentication",
    };
    expect(read().counts.workspaces).toBeUndefined();
  });

  it('marks the counts still loading, for the strip to hold their place', () => {
    mockAgentsLoading = true;
    mockModelsLoading = true;
    mockSkillsLoading = true;
    mockWorkspacesLoading = true;
    expect(read()).toEqual({
      counts: {
        agents: 'loading',
        models: 'loading',
        skills: 'loading',
        workspaces: 'loading',
      },
    });
  });

  describe('the settled counts', () => {
    it('are the counts once every installation answered, every Organization’s workspaces', () => {
      expect(readSettled()).toEqual({
        agents: 2,
        models: 1,
        skills: 1,
        workspaces: 5,
      });
    });

    // The strip shows a growing number; a report sent once must not.
    it('stay loading while some installations are still read', () => {
      mockAgentsLoadingMore = true;
      mockModelsPartial = true;
      expect(readSettled()).toEqual({
        agents: 'loading',
        models: 'loading',
        skills: 1,
        workspaces: 5,
      });
    });

    it('leave out a total an unread installation or repository would make short', () => {
      mockUnreachable = ['otter'];
      mockFailedRepositories = ['https://github.com/example/more-skills'];
      mockWorkspaceFailures = { otter: 'unreachable' };
      expect(readSettled()).toEqual({ models: 1 });
    });
  });
});
