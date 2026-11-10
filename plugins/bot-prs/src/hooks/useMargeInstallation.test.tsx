import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

let mockScope = 'all';
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ALL_INSTALLATIONS: 'all',
  applyInstallationScope: (names: string[], scope: string) =>
    scope === 'all' ? names : names.filter(name => name === scope),
  useInstallationScope: () => ({
    scope: mockScope,
    home: 'gazelle',
    isSingleInstallation: false,
  }),
  useInstallations: () => ({
    installations: [{ name: 'gazelle' }, { name: 'glean' }],
    isLoading: false,
  }),
}));

// eslint-disable-next-line import/first
import { useMargeInstallation } from './useMarge';

const listServers = jest.fn();
// Both installations sign the person in: marge's tools act for them.
const listInstallations = jest.fn<Promise<unknown>, []>(async () => ({
  installations: [
    { name: 'gazelle', requiresAuth: true },
    { name: 'glean', requiresAuth: true },
  ],
}));
const musterApi = { listServers, listInstallations } as unknown as MusterApi;

function render() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useMargeInstallation(), { wrapper });
}

beforeEach(() => {
  mockScope = 'all';
  listServers.mockReset();
});

describe('useMargeInstallation', () => {
  it('takes the installation whose muster lists marge', async () => {
    listServers.mockImplementation((installation: string) =>
      Promise.resolve({
        mcpServers:
          installation === 'glean'
            ? [{ name: 'mcp-marge', toolPrefix: 'marge' }]
            : [],
      }),
    );

    const { result } = render();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installation).toBe('glean');
  });

  it('leaves the page without an installation when every muster answered without marge', async () => {
    listServers.mockResolvedValue({ mcpServers: [] });

    const { result } = render();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installation).toBeUndefined();
  });

  it('calls marge on the home installation when no server list could be read', async () => {
    listServers.mockRejectedValue(new Error('muster answered 503'));

    const { result } = render();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installation).toBe('gazelle');
    expect(result.current.isResolvedFromAll).toBe(false);
  });

  it('keeps a pinned scope on its own installation when its server list failed', async () => {
    mockScope = 'glean';
    listServers.mockRejectedValue(new Error('muster answered 503'));

    const { result } = render();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installation).toBe('glean');
  });
});

describe('useMargeInstallation on installations marge cannot be used on', () => {
  it('offers none where muster lists marge without a per-user sign-in, and names them', async () => {
    listInstallations.mockResolvedValueOnce({
      installations: [
        { name: 'gazelle', requiresAuth: false },
        { name: 'glean', requiresAuth: false },
      ],
    });
    listServers.mockResolvedValue({
      mcpServers: [{ name: 'mcp-marge', toolPrefix: 'marge' }],
    });

    const { result } = render();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installation).toBeUndefined();
    expect(result.current.withoutPerUserSignIn).toEqual(['gazelle', 'glean']);
  });

  it('calls marge on a pinned installation the portal reports it cannot reach, so muster says why', async () => {
    mockScope = 'glean';
    listInstallations.mockResolvedValueOnce({
      installations: [
        { name: 'gazelle', requiresAuth: true },
        { name: 'glean', requiresAuth: true, reachable: false },
      ],
    });
    listServers.mockResolvedValue({ mcpServers: [] });

    const { result } = render();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installation).toBe('glean');
  });

  it('offers none on a pinned installation that is unreachable and has no per-user sign-in, and names it', async () => {
    mockScope = 'glean';
    listInstallations.mockResolvedValueOnce({
      installations: [
        { name: 'gazelle', requiresAuth: true },
        { name: 'glean', requiresAuth: false, reachable: false },
      ],
    });
    listServers.mockResolvedValue({ mcpServers: [] });

    const { result } = render();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installation).toBeUndefined();
    expect(result.current.withoutPerUserSignIn).toEqual(['glean']);
  });

  it('offers none on a pinned installation whose server list failed and that has no per-user sign-in', async () => {
    mockScope = 'glean';
    listInstallations.mockResolvedValueOnce({
      installations: [
        { name: 'gazelle', requiresAuth: true },
        { name: 'glean', requiresAuth: false },
      ],
    });
    listServers.mockRejectedValue(new Error('muster answered 503'));

    const { result } = render();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installation).toBeUndefined();
    expect(result.current.withoutPerUserSignIn).toEqual(['glean']);
  });

  it('passes on why the installations could not be read', async () => {
    listInstallations.mockRejectedValueOnce(new Error('answered 502'));
    listServers.mockResolvedValue({
      mcpServers: [{ name: 'mcp-marge', toolPrefix: 'marge' }],
    });

    const { result } = render();

    await waitFor(() =>
      expect(result.current.installationsError?.message).toBe('answered 502'),
    );
    expect(result.current.installation).toBeUndefined();
  });
});
