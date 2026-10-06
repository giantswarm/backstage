import { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { musterApiRef, type MusterApi } from '../../apis';
import type { McpServerDefinition } from '../../lib/mcpServerDefinition';
import {
  useRegisterMcpServer,
  type McpServerRegistration,
} from './useRegisterMcpServer';

const callTool = jest.fn();
const musterApi = { callTool } as unknown as MusterApi;
const analyticsApi = mockApis.analytics.mock();

const definition: McpServerDefinition = {
  name: 'github',
  type: 'streamable-http',
  url: 'https://mcp.example.com/mcp',
  autoStart: true,
};

const registration: McpServerRegistration = {
  definition,
  installation: 'gazelle',
  authMode: 'own-account',
  isEdit: false,
};

function renderRegister() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [musterApiRef, musterApi],
        [analyticsApiRef, analyticsApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return {
    ...renderHook(() => useRegisterMcpServer(), { wrapper }),
    invalidateQueries,
  };
}

beforeEach(() => {
  callTool.mockReset();
  callTool.mockResolvedValue({});
  jest.mocked(analyticsApi.captureEvent).mockClear();
});

describe('useRegisterMcpServer', () => {
  it('validates, creates and reports the added server with its auth mode', async () => {
    const { result, invalidateQueries } = renderRegister();

    await act(() => result.current.mutateAsync(registration));

    expect(callTool.mock.calls).toEqual([
      ['core_mcpserver_validate', definition, 'gazelle'],
      ['core_mcpserver_create', definition, 'gazelle'],
    ]);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['muster'] });
    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Muster.mcpServerAdded',
        attributes: { authMode: 'own-account' },
      }),
    );
  });

  it('updates in place on an edit and reports no addition', async () => {
    const { result } = renderRegister();

    await act(() =>
      result.current.mutateAsync({ ...registration, isEdit: true }),
    );

    expect(callTool).toHaveBeenLastCalledWith(
      'core_mcpserver_update',
      definition,
      'gazelle',
    );
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  it('writes nothing and reports nothing when validation refuses', async () => {
    callTool.mockRejectedValueOnce(new Error('url: must be https'));
    const { result } = renderRegister();

    await act(() =>
      result.current.mutateAsync(registration).catch(() => undefined),
    );

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });
});
