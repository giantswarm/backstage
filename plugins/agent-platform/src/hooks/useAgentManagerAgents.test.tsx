import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { useAgentManagerAgents } from './useAgentManagerAgents';

describe('useAgentManagerAgents', () => {
  it("reads each agent's get_agent, keyed by its id, settled once answered or failed", async () => {
    const api = {
      callTool: async (
        _name: string,
        args: { namespace: string; name: string },
        installation: string,
      ) => {
        if (installation === 'lab') {
          throw new Error('agent-manager answered 500');
        }
        return {
          name: args.name,
          namespace: args.namespace,
          exists: true,
          ready: false,
          managed: 'platform',
          default: true,
        };
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
    const refs = [
      { installation: 'golem', namespace: 'kagent', name: 'default-agent' },
      { installation: 'lab', namespace: 'kagent', name: 'default-agent' },
    ];

    const { result } = renderHook(() => useAgentManagerAgents(refs), {
      wrapper,
    });

    await waitFor(() =>
      expect(
        [...result.current.values()].every(reading => reading.settled),
      ).toBe(true),
    );
    expect(result.current.get('golem/kagent/default-agent')?.agent).toEqual(
      expect.objectContaining({ managed: 'platform', default: true }),
    );
    expect(result.current.get('lab/kagent/default-agent')).toEqual({
      agent: undefined,
      settled: true,
    });
  });
});
