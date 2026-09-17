import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';
import { useModelManagerInstallations } from './useModelManagerInstallations';

const listServers = jest.fn();
const musterApi = { listServers } as unknown as MusterApi;

function render(installations: string[], withMuster = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => {
    const inner = (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return withMuster ? (
      <TestApiProvider apis={[[musterApiRef, musterApi]]}>
        {inner}
      </TestApiProvider>
    ) : (
      <TestApiProvider apis={[]}>{inner}</TestApiProvider>
    );
  };
  return renderHook(() => useModelManagerInstallations(installations), {
    wrapper,
  });
}

beforeEach(() => {
  listServers.mockReset();
  listServers.mockImplementation(async (installation: string) => ({
    mcpServers:
      installation === 'gpu'
        ? [{ name: 'mcp-kubernetes' }, { name: 'model-manager' }]
        : [{ name: 'mcp-kubernetes' }],
  }));
});

describe('useModelManagerInstallations', () => {
  it('keeps the installations whose muster lists model-manager, in input order, and says which answered without it', async () => {
    const { result } = render(['lab', 'gpu']);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installations).toEqual(['gpu']);
    expect(result.current.presenceOf('gpu')).toBe('available');
    expect(result.current.presenceOf('lab')).toBe('missing');
    expect(result.current.isUnavailable).toBe(false);
    expect(listServers).toHaveBeenCalledWith('lab');
    expect(listServers).toHaveBeenCalledWith('gpu');
  });

  it('answers unknown, never missing, while a list is in flight or failed', async () => {
    listServers.mockImplementation(async (installation: string) => {
      if (installation === 'down') {
        throw new Error('muster is not reachable from this portal');
      }
      return { mcpServers: [{ name: 'model-manager' }] };
    });
    const { result } = render(['gpu', 'down']);

    expect(result.current.presenceOf('gpu')).toBe('unknown');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installations).toEqual(['gpu']);
    expect(result.current.presenceOf('down')).toBe('unknown');
  });

  it('has model-manager nowhere without the muster plugin', async () => {
    const { result } = render(['gpu'], false);

    expect(result.current.isUnavailable).toBe(true);
    expect(result.current.installations).toEqual([]);
    expect(result.current.presenceOf('gpu')).toBe('unknown');
    expect(listServers).not.toHaveBeenCalled();
  });
});
