import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- agent-manager is reached through muster.
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { useAgentApprovalSupport } from './useAgentApprovalSupport';
import { useAgentApprovalReport } from './useAgentApprovalReport';

function wrapperFor(api: Partial<MusterApi>, client: QueryClient) {
  return ({ children }: PropsWithChildren) => (
    <TestApiProvider apis={[[musterApiRef, api as MusterApi]]}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
}

describe('useAgentApprovalSupport', () => {
  it('keeps a known answer when a later re-read fails', async () => {
    const describeTool = jest
      .fn()
      .mockResolvedValueOnce({ inputSchema: { properties: { tools: {} } } })
      .mockRejectedValue(new Error('muster answered 503'));
    const client = new QueryClient();
    const { result } = renderHook(() => useAgentApprovalSupport('gazelle'), {
      wrapper: wrapperFor({ describeTool }, client),
    });
    await waitFor(() => expect(result.current).toBe('supported'));
    await act(() => client.refetchQueries());
    expect(describeTool).toHaveBeenCalledTimes(2);
    expect(result.current).toBe('supported');
  });
});

describe('useAgentApprovalReport', () => {
  it('reads every page, and needs the echo of the list to call it a report', async () => {
    const filterTools = jest.fn(async ({ offset }: { offset?: number }) => ({
      total: 2,
      filtered_count: 2,
      truncated: !offset,
      tools: [{ name: offset ? 'x_b' : 'x_a' }],
      agentTools: { entries: ['server:x'], settings: [] },
    }));
    const { result } = renderHook(
      () => useAgentApprovalReport('gazelle', { tools: ['server:x'] }),
      { wrapper: wrapperFor({ filterTools } as never, new QueryClient()) },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.tools.map(tool => tool.name)).toEqual(['x_a', 'x_b']);
    expect(filterTools.mock.calls.map(([options]) => options.offset)).toEqual([
      0, 500,
    ]);
  });

  it('reads an answer without the echo as a muster that does not evaluate agent lists', async () => {
    const filterTools = jest.fn(async () => ({
      total: 1,
      filtered_count: 1,
      truncated: false,
      tools: [{ name: 'x_a' }],
      toolset: ['server:x'],
    }));
    const { result } = renderHook(
      () => useAgentApprovalReport('gazelle', { tools: ['server:x'] }),
      { wrapper: wrapperFor({ filterTools } as never, new QueryClient()) },
    );
    await waitFor(() => expect(result.current.status).toBe('unsupported'));
  });
});
