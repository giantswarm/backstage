import { PropsWithChildren, useEffect } from 'react';
import { renderHook, screen, waitFor } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  musterServerListQueryKey,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { musterAgentManagerInfoQueryKey } from '../lib/queryKeys';
import {
  NewAgentFormProvider,
  useNewAgentForm,
  useTenantChoicesSync,
} from '../components/NewAgentFormProvider';
import { useOwnerField } from '../components/NewAgentPage/hooks/useOwnerField';
import { useWarmNewAgentForm } from './useWarmNewAgentForm';

// The organizations agent-manager names for the person
// (`list_organizations`).
jest.mock('../components/OrganizationDirectoryProvider', () => ({
  ...jest.requireActual('../components/OrganizationDirectoryProvider'),
  useOrganizationDirectory: () =>
    jest.requireActual('../lib/__fixtures__/organizations')
      .TEST_ORGANIZATION_DIRECTORY,
}));

let mockInstallations: { name: string }[];
let mockHome: string | undefined;
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallations: () => ({
    installations: mockInstallations,
    isLoading: false,
  }),
  useHomeInstallation: () => ({
    home: mockHome ? { name: mockHome } : undefined,
    isLoading: false,
  }),
}));

/** muster on every installation: agent-manager registered; `get_info` names acme. */
function muster(calls: string[]): MusterApi {
  return {
    listInstallations: async () => ({
      installations: mockInstallations.map(({ name }) => ({
        name,
        requiresAuth: true,
      })),
    }),
    listServers: async () => ({ mcpServers: [{ name: 'agent-manager' }] }),
    callTool: async (_name: string, _args: unknown, installation: string) => {
      calls.push(installation);
      return { namespaces: { default: 'kagent', managed: ['org-acme'] } };
    },
  } as unknown as MusterApi;
}

function warm(options?: { enabled?: boolean }) {
  const calls: string[] = [];
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[musterApiRef, muster(calls)]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  renderHook(() => useWarmNewAgentForm(options), { wrapper });
  return { calls, queryClient };
}

describe('useWarmNewAgentForm', () => {
  beforeEach(() => {
    mockInstallations = [{ name: 'gazelle' }];
    mockHome = undefined;
  });

  it('reads the only environment’s agent-manager and where the person may create there', async () => {
    const { calls, queryClient } = warm();

    await waitFor(() =>
      expect(
        queryClient.getQueryData(musterAgentManagerInfoQueryKey('gazelle')),
      ).toEqual({ namespaces: { default: 'kagent', managed: ['org-acme'] } }),
    );
    expect(
      queryClient.getQueryData(musterServerListQueryKey('gazelle')),
    ).toBeDefined();
    expect(calls).toEqual(['gazelle']);
  });

  it('reads the home installation alone among several', async () => {
    mockInstallations = [
      { name: 'alpha' },
      { name: 'gazelle' },
      { name: 'golem' },
    ];
    mockHome = 'gazelle';
    const { calls, queryClient } = warm();

    await waitFor(() => expect(calls).toEqual(['gazelle']));
    expect(
      queryClient.getQueryData(musterServerListQueryKey('alpha')),
    ).toBeUndefined();
  });

  it('reads nothing where it is not enabled (an edit)', async () => {
    const { calls, queryClient } = warm({ enabled: false });

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(calls).toEqual([]);
    expect(
      queryClient.getQueryData(musterServerListQueryKey('gazelle')),
    ).toBeUndefined();
  });

  it('reads nothing among several without a home installation', async () => {
    mockInstallations = [{ name: 'alpha' }, { name: 'golem' }];
    const { calls, queryClient } = warm();

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(calls).toEqual([]);
    // Nothing fetched: the hooks' queries stay disabled.
    for (const query of queryClient.getQueryCache().getAll()) {
      expect(query.state.dataUpdatedAt).toBe(0);
      expect(query.state.fetchStatus).toBe('idle');
    }
  });

  it('lets the form show Owner at once from the warm cache', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(musterAgentManagerInfoQueryKey('gazelle'), {
      namespaces: { default: 'kagent', managed: ['org-acme'] },
    });
    // A read the form started itself would never answer.
    const pending = {
      listInstallations: () => new Promise(() => {}),
      listServers: () => new Promise(() => {}),
      callTool: () => new Promise(() => {}),
    } as unknown as MusterApi;
    function Form() {
      const { state, setInstallation } = useNewAgentForm();
      useEffect(() => {
        if (!state.installation) {
          setInstallation('gazelle');
        }
      }, [state.installation, setInstallation]);
      useTenantChoicesSync();
      return <>{useOwnerField().field}</>;
    }
    await renderInTestApp(
      <TestApiProvider apis={[[musterApiRef, pending]]}>
        <QueryClientProvider client={queryClient}>
          <NewAgentFormProvider>
            <Form />
          </NewAgentFormProvider>
        </QueryClientProvider>
      </TestApiProvider>,
    );

    expect(
      screen.getByText(/the only one you may create agents for on gazelle/),
    ).toHaveTextContent(/^Owner: acme,/);
  });
});
