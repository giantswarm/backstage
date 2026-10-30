import { renderHook } from '@testing-library/react';
import type { AgentRow } from '../components/AgentsDataProvider';
import { useUsageOrganizations } from './useUsageOrganizations';

const mimirState: {
  data: { data: { result: { metric: Record<string, string> }[] } } | undefined;
  isLoading: boolean;
  lastOptions: Record<string, unknown> | undefined;
} = { data: undefined, isLoading: false, lastOptions: undefined };

// Only the query hook is stubbed: the query builder reads the metric
// constants from the same package.
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-gs'),
  useMimirQuery: (options: Record<string, unknown>) => {
    mimirState.lastOptions = options;
    return { data: mimirState.data, isLoading: mimirState.isLoading };
  },
}));

const agentsState: { rows: AgentRow[]; isLoading: boolean } = {
  rows: [],
  isLoading: false,
};

jest.mock('../components/AgentsDataProvider', () => ({
  useAgents: () => agentsState,
}));

function seen(...namespaces: string[]) {
  return {
    data: {
      result: namespaces.map(namespace => ({
        metric: { agent_namespace: namespace },
      })),
    },
  };
}

function agent(installation: string, namespace: string): AgentRow {
  return { installation, namespace } as AgentRow;
}

describe('useUsageOrganizations', () => {
  beforeEach(() => {
    mimirState.data = undefined;
    mimirState.isLoading = false;
    mimirState.lastOptions = undefined;
    agentsState.rows = [];
    agentsState.isLoading = false;
  });

  it('joins the namespaces the gateway saw with the roster’s, platform first, then organizations by name, then other namespaces', () => {
    mimirState.data = seen('org-zulu', 'team-x', 'org-marian');
    agentsState.rows = [
      agent('gazelle', 'kagent'),
      agent('gazelle', 'org-alpha'),
      agent('other', 'org-elsewhere'),
    ];

    const { result } = renderHook(() => useUsageOrganizations('gazelle', 30));

    expect(result.current.namespaces).toEqual([
      'kagent',
      'org-alpha',
      'org-marian',
      'org-zulu',
      'team-x',
    ]);
  });

  it('leaves unattributed traffic out: it has no namespace to narrow to', () => {
    mimirState.data = seen('unknown', '', 'org-alpha');

    const { result } = renderHook(() => useUsageOrganizations('gazelle', 30));

    expect(result.current.namespaces).toEqual(['org-alpha']);
  });

  it('asks the gateway for the window, never narrowed to an organization', () => {
    renderHook(() => useUsageOrganizations('gazelle', 7));

    expect(mimirState.lastOptions).toMatchObject({
      installationName: 'gazelle',
      enabled: true,
    });
    expect(String(mimirState.lastOptions?.query)).toContain('[7d]');
    expect(String(mimirState.lastOptions?.query)).not.toContain(
      'agent_namespace=',
    );
  });

  it('starts no query and offers nothing without an installation', () => {
    agentsState.rows = [agent('gazelle', 'org-alpha')];

    const { result } = renderHook(() => useUsageOrganizations(undefined, 30));

    expect(mimirState.lastOptions).toMatchObject({ enabled: false });
    // Without an installation the roster is every installation's, and none
    // of it is this page's.
    expect(result.current.namespaces).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
