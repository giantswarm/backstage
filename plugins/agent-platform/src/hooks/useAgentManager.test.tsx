import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import type { ListedOrganization } from '../lib/organizations';
import { musterOrganizationsQueryKey } from '../lib/queryKeys';
import { useCreatesAgentsNowhere, useDefaultAgentIds } from './useAgentManager';

/**
 * What agent-manager answers on an installation: `get_info`'s namespaces the
 * person may create in, an answer without `managed`, a failure, or no
 * agent-manager registered in muster there. Or an agent-manager that serves
 * organizations, with no `managed` namespace, and what its
 * `list_organizations` answers.
 */
type InfoAnswer =
  | string[]
  | 'no managed'
  | 'fails'
  | 'absent'
  | { organizations: ListedOrganization[] | 'fails' };

function muster(answers: Record<string, InfoAnswer>): MusterApi {
  return {
    listInstallations: async () => ({
      installations: Object.keys(answers).map(name => ({
        name,
        requiresAuth: true,
      })),
    }),
    listServers: async (installation: string) => ({
      mcpServers:
        answers[installation] === 'absent' ? [] : [{ name: 'agent-manager' }],
    }),
    callTool: async (name: string, _args: unknown, installation: string) => {
      const answer = answers[installation];
      if (answer === 'fails') {
        throw new Error('agent-manager answered 500');
      }
      if (typeof answer === 'object' && !Array.isArray(answer)) {
        if (name !== 'x_agent-manager_list_organizations') {
          return {
            namespaces: { default: 'kagent', managed: [] },
            capabilities: { organizations: true },
          };
        }
        if (answer.organizations === 'fails') {
          throw new Error('agent-manager answered 500');
        }
        return { organizations: answer.organizations };
      }
      return answer === 'no managed'
        ? { namespaces: { default: 'kagent' } }
        : { namespaces: { default: 'kagent', managed: answer } };
    },
  } as unknown as MusterApi;
}

function renderWith(
  answers: Record<string, InfoAnswer>,
  cache?: (queryClient: QueryClient) => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  cache?.(queryClient);
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[musterApiRef, muster(answers)]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  // Every answer the hook gave, the ones before it settled too.
  const answered: boolean[] = [];
  const view = renderHook(
    () => {
      const result = useCreatesAgentsNowhere(Object.keys(answers));
      answered.push(result.createsNowhere);
      return result;
    },
    { wrapper },
  );
  return { ...view, answered };
}

/** An organization `list_organizations` names, with its namespace. */
function organization(
  permissions: Partial<ListedOrganization['permissions']>,
): ListedOrganization {
  return {
    name: 'acme',
    namespace: 'agents-acme-x7k2q',
    permissions: { manage: false, member: true, ...permissions },
  };
}

describe('useCreatesAgentsNowhere', () => {
  it.each<[string, InfoAnswer, boolean]>([
    ['names no tenant there either', [], true],
    ['names a tenant there', ['org-acme'], false],
    ['answers without a managed list there', 'no managed', false],
    ['fails there', 'fails', false],
    ['is not registered in muster there', 'absent', false],
  ])(
    'on two environments, one naming no tenant: agent-manager %s',
    async (_case, lab, createsNowhere) => {
      const { result } = renderWith({ golem: [], lab });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.createsNowhere).toBe(createsNowhere);
    },
  );

  it.each<[string, ListedOrganization[] | 'fails', boolean]>([
    [
      'belongs to an organization they may create agents in',
      [organization({ createAgents: true })],
      false,
    ],
    [
      'belongs to an organization, and agent-manager does not say whether they may create agents there',
      [organization({})],
      false,
    ],
    ['belongs to no organization', [], true],
    [
      'only manages an organization they do not belong to',
      [organization({ manage: true, member: false, createAgents: true })],
      true,
    ],
    [
      'belongs only to organizations they may not create agents in',
      [organization({ createAgents: false })],
      true,
    ],
    ['cannot be read: list_organizations fails', 'fails', false],
  ])(
    'where agent-manager serves organizations and names no managed namespace: a person who %s',
    async (_case, organizations, createsNowhere) => {
      const { result } = renderWith({ golem: { organizations } });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.createsNowhere).toBe(createsNowhere);
    },
  );

  it('reads an organization list from before it rendered again, and decides on the new answer only', async () => {
    // The directory read the list half a minute ago, before an admin added
    // the person to acme.
    const { result, answered } = renderWith(
      { golem: { organizations: [organization({ createAgents: true })] } },
      queryClient =>
        queryClient.setQueryData(
          musterOrganizationsQueryKey('golem'),
          { organizations: [] },
          { updatedAt: Date.now() - 30_000 },
        ),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.createsNowhere).toBe(false);
    expect(answered).not.toContain(true);
  });
});

describe('useDefaultAgentIds', () => {
  /** agent-manager's `defaultAgent` per installation, or not registered. */
  function renderDefaults(
    defaults: Record<string, string | 'absent'>,
    options?: { everywhere?: boolean },
  ) {
    const asked: string[] = [];
    const api = {
      listInstallations: async () => ({
        installations: Object.keys(defaults).map(name => ({
          name,
          requiresAuth: true,
        })),
      }),
      listServers: async (installation: string) => ({
        mcpServers:
          defaults[installation] === 'absent'
            ? []
            : [{ name: 'agent-manager' }],
      }),
      callTool: async (_name: string, _args: unknown, installation: string) => {
        asked.push(installation);
        return { namespaces: {}, defaultAgent: defaults[installation] };
      },
    } as unknown as MusterApi;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <TestApiProvider apis={[[musterApiRef, api]]}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </TestApiProvider>
    );
    const view = renderHook(
      () => useDefaultAgentIds(Object.keys(defaults), options),
      { wrapper },
    );
    return { ...view, asked };
  }

  it('asks only the home installation when it names one', async () => {
    const { result, asked } = renderDefaults({
      golem: 'kagent/default-agent',
      lab: 'kagent/lab-default',
    });

    await waitFor(() =>
      expect([...result.current]).toEqual(['golem/kagent/default-agent']),
    );
    expect(asked).toEqual(['golem']);
  });

  it('asks the others when the home installation names none', async () => {
    const { result } = renderDefaults({
      golem: '',
      lab: 'kagent/lab-default',
    });

    await waitFor(() =>
      expect([...result.current]).toEqual(['lab/kagent/lab-default']),
    );
  });

  it('never asks where muster does not reach agent-manager', async () => {
    const { result, asked } = renderDefaults({
      golem: 'absent',
      lab: 'kagent/lab-default',
    });

    await waitFor(() =>
      expect([...result.current]).toEqual(['lab/kagent/lab-default']),
    );
    expect(asked).toEqual(['lab']);
  });

  it('asks every installation with `everywhere`', async () => {
    const { result } = renderDefaults(
      { golem: 'kagent/default-agent', lab: 'kagent/lab-default' },
      { everywhere: true },
    );

    await waitFor(() =>
      expect([...result.current]).toEqual([
        'golem/kagent/default-agent',
        'lab/kagent/lab-default',
      ]),
    );
  });
});
