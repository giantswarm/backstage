import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { useMusterServerAvailability } from './useMusterServerAvailability';

const listServers = jest.fn();
const musterApi = { listServers } as unknown as MusterApi;

function render(serverName: string, installations: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(
    () => useMusterServerAvailability(serverName, installations),
    { wrapper },
  );
}

beforeEach(() => {
  listServers.mockReset();
});

describe('useMusterServerAvailability', () => {
  it('matches the tool prefix, which is what the server is addressed by, not its name', async () => {
    listServers.mockResolvedValue({
      mcpServers: [
        { name: 'gazelle-mcp-marge', toolPrefix: 'marge' },
        { name: 'gazelle-mcp-pro', toolPrefix: 'pro' },
      ],
    });

    const { result } = render('marge', ['gazelle']);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.available).toEqual(['gazelle']);
    expect(result.current.presenceOf('gazelle')).toBe('available');
  });

  it('falls back to the name for a server declared without a prefix', async () => {
    listServers.mockResolvedValue({
      mcpServers: [{ name: 'agent-manager' }],
    });

    const { result } = render('agent-manager', ['gazelle']);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.available).toEqual(['gazelle']);
  });

  it('matches the family name a family server shares with its siblings', async () => {
    listServers.mockResolvedValue({
      mcpServers: [
        { name: 'gazelle-mcp-capi', family: { name: 'capi' } },
        { name: 'glean-mcp-capi', family: { name: 'capi' } },
      ],
    });

    const { result } = render('capi', ['gazelle']);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.available).toEqual(['gazelle']);
  });

  it('reports missing when no server exposes that name', async () => {
    listServers.mockResolvedValue({
      mcpServers: [{ name: 'gazelle-mcp-marge', toolPrefix: 'marge' }],
    });

    const { result } = render('github', ['gazelle']);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.missing).toEqual(['gazelle']);
  });
});
