import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import { ConnectorNamesResponse, MusterApi, musterApiRef } from '../../../apis';
import { useConnectorLabel, useConnectorLabels } from './useConnectorLabels';

function setup(answer: () => Promise<ConnectorNamesResponse>) {
  const api = { listConnectorNames: jest.fn(answer) };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider apis={[[musterApiRef, api as Partial<MusterApi>]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return { api, wrapper };
}

describe('useConnectorLabels', () => {
  it('names each connector as muster-backend names it, its own name otherwise', async () => {
    const { api, wrapper } = setup(async () => ({
      servers: [
        { name: 'agent-manager', displayName: 'Agent Manager' },
        {
          name: 'gazelle-mcp-kubernetes',
          family: 'kubernetes',
          displayName: 'Kubernetes',
        },
      ],
    }));
    const names = ['agent-manager', 'gazelle-mcp-kubernetes', 'unknown'];

    const { result } = renderHook(() => useConnectorLabels('gazelle', names), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current('agent-manager')).toBe('Agent Manager'),
    );
    expect(result.current('gazelle-mcp-kubernetes')).toBe('Kubernetes');
    expect(result.current('unknown')).toBe('unknown');
    expect(api.listConnectorNames).toHaveBeenCalledWith('gazelle');
  });

  it('keeps the technical name while the read is under way and when it fails', async () => {
    let fail: (error: Error) => void = () => {};
    const { wrapper } = setup(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );

    const { result } = renderHook(
      () => useConnectorLabel('gazelle', 'agent-manager'),
      { wrapper },
    );
    expect(result.current).toBe('agent-manager');

    fail(new Error('Muster request failed with status 502'));
    await waitFor(() => expect(result.current).toBe('agent-manager'));
  });

  it('keeps the technical name when muster could not list the connectors, and reads again on the next mount', async () => {
    let answer: ConnectorNamesResponse = { servers: [], unavailable: true };
    const { api, wrapper } = setup(async () => answer);

    const first = renderHook(
      () => useConnectorLabel('gazelle', 'agent-manager'),
      { wrapper },
    );
    await waitFor(() => expect(api.listConnectorNames).toHaveBeenCalled());
    expect(first.result.current).toBe('agent-manager');
    first.unmount();

    // Not kept as an answer: muster is back, and the next prompt names it.
    answer = {
      servers: [{ name: 'agent-manager', displayName: 'Agent Manager' }],
    };
    const second = renderHook(
      () => useConnectorLabel('gazelle', 'agent-manager'),
      { wrapper },
    );
    await waitFor(() => expect(second.result.current).toBe('Agent Manager'));
    expect(api.listConnectorNames).toHaveBeenCalledTimes(2);
  });

  it('reads once per installation for every caller', async () => {
    const { api, wrapper } = setup(async () => ({
      servers: [{ name: 'agent-manager', displayName: 'Agent Manager' }],
    }));

    const { result } = renderHook(
      () => [
        useConnectorLabel('gazelle', 'agent-manager'),
        useConnectorLabel('gazelle', 'workspace-manager'),
      ],
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current).toEqual(['Agent Manager', 'workspace-manager']),
    );
    expect(api.listConnectorNames).toHaveBeenCalledTimes(1);
  });

  it('does not read while disabled', () => {
    const { api, wrapper } = setup(async () => ({ servers: [] }));

    const { result } = renderHook(
      () =>
        useConnectorLabels('gazelle', ['agent-manager'], { enabled: false }),
      { wrapper },
    );

    expect(result.current('agent-manager')).toBe('agent-manager');
    expect(api.listConnectorNames).not.toHaveBeenCalled();
  });
});
