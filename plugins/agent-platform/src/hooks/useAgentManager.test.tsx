import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { useCreatesAgentsNowhere } from './useAgentManager';

/**
 * What agent-manager's `get_info` answers on an installation: the namespaces
 * the person may create in, an answer without `managed`, a failure, or no
 * agent-manager registered in muster there.
 */
type InfoAnswer = string[] | 'no managed' | 'fails' | 'absent';

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
    callTool: async (_name: string, _args: unknown, installation: string) => {
      const answer = answers[installation];
      if (answer === 'fails') {
        throw new Error('agent-manager answered 500');
      }
      return answer === 'no managed'
        ? { namespaces: { default: 'kagent' } }
        : { namespaces: { default: 'kagent', managed: answer } };
    },
  } as unknown as MusterApi;
}

function renderWith(answers: Record<string, InfoAnswer>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[musterApiRef, muster(answers)]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useCreatesAgentsNowhere(Object.keys(answers)), {
    wrapper,
  });
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
});
