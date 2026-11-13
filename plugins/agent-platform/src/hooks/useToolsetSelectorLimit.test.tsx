import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- The schema is read through the Muster API.
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { useToolsetSelectorLimit } from './useToolsetSelectorLimit';
import { toolsetProblems } from '../lib/toolset';

it.each([17, 32, 128])(
  'uses the advertised selector limit %s',
  async maximum => {
    const describeTool = jest.fn().mockResolvedValue({
      inputSchema: { properties: { toolset: { maxItems: maximum } } },
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <TestApiProvider
        apis={[[musterApiRef, { describeTool } as unknown as MusterApi]]}
      >
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </TestApiProvider>
    );
    const { result } = renderHook(() => useToolsetSelectorLimit('example'), {
      wrapper,
    });
    await waitFor(() =>
      expect(describeTool).toHaveBeenCalledWith(
        'x_agent-manager_create_agent',
        'example',
      ),
    );
    await waitFor(() => expect(result.current).toBe(maximum));
    expect(
      toolsetProblems(Array(maximum).fill('tool:x'), undefined, result.current),
    ).toEqual([]);
    expect(
      toolsetProblems(
        Array(maximum + 1).fill('tool:x'),
        undefined,
        result.current,
      ),
    ).toHaveLength(1);
    client.clear();
  },
);

it('keeps the compatibility fallback when the schema cannot be read', async () => {
  const describeTool = jest.fn().mockRejectedValue(new Error('offline'));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[[musterApiRef, { describeTool } as unknown as MusterApi]]}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  const { result } = renderHook(() => useToolsetSelectorLimit('example'), {
    wrapper,
  });
  await waitFor(() => expect(describeTool).toHaveBeenCalled());
  expect(result.current).toBe(128);
  client.clear();
});
