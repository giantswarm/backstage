import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useScopedToolchainCount } from './useToolchainManager';

let mockMusterInstallations: string[];
let mockAvailable: string[];
/** Installations whose muster did not say whether it has the server. */
let mockUnknown: string[];
let mockAvailabilityLoading: boolean;
let mockMusterApi: object | undefined;
const mockListToolchains = jest.fn();

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-gs'),
  useInstallationInventory: () => ({
    installationsWith: () => mockMusterInstallations,
    isLoading: false,
    isProbing: false,
  }),
  useInstallationScope: () => ({ scope: 'all' }),
  applyInstallationScope: (installations: string[]) => installations,
}));
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-muster'),
  useMusterServerAvailability: () => ({
    available: mockAvailable,
    sharedIdentity: [],
    isLoading: mockAvailabilityLoading,
    presenceOf: (installation: string) => {
      if (mockUnknown.includes(installation)) {
        return 'unknown';
      }
      return mockAvailable.includes(installation) ? 'available' : 'missing';
    },
  }),
}));
jest.mock('./useMusterPluginApi', () => ({
  useMusterPluginApi: () => mockMusterApi,
}));
jest.mock('../apis/ToolchainManagerClient', () => ({
  ToolchainManagerClient: class {
    constructor(
      _api: unknown,
      readonly installation: string,
    ) {}
    listToolchains() {
      return mockListToolchains(this.installation);
    }
  },
}));

function toolchains(count: number) {
  return {
    toolchains: Array.from({ length: count }, (_, index) => ({
      name: `toolchain-${index}`,
    })),
  };
}

function renderCount() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useScopedToolchainCount(), { wrapper });
}

describe('useScopedToolchainCount', () => {
  beforeEach(() => {
    mockMusterInstallations = ['gazelle', 'otter'];
    mockAvailable = ['gazelle', 'otter'];
    mockUnknown = [];
    mockAvailabilityLoading = false;
    mockMusterApi = {};
    mockListToolchains.mockReset();
  });

  it('adds up the toolchains every installation in scope lists', async () => {
    mockListToolchains.mockImplementation(async (installation: string) =>
      toolchains(installation === 'gazelle' ? 3 : 4),
    );

    const { result } = renderCount();

    expect(result.current).toBe('loading');
    await waitFor(() => expect(result.current).toBe(7));
  });

  it('is 0 where no installation has the toolchain-manager', () => {
    mockAvailable = [];

    const { result } = renderCount();

    expect(result.current).toBe(0);
    expect(mockListToolchains).not.toHaveBeenCalled();
  });

  it('is loading while it is not known which installations have one', () => {
    mockAvailable = [];
    mockAvailabilityLoading = true;

    expect(renderCount().result.current).toBe('loading');
  });

  it('waits for every installation to say whether it has one', async () => {
    // One has answered with the toolchain-manager, another is still asked.
    mockAvailable = ['gazelle'];
    mockAvailabilityLoading = true;
    mockListToolchains.mockResolvedValue(toolchains(3));

    const { result } = renderCount();

    await waitFor(() => expect(mockListToolchains).toHaveBeenCalled());
    expect(result.current).toBe('loading');
  });

  it('is unknown, not a partial count, when an installation could not be asked', () => {
    mockAvailable = ['gazelle'];
    mockUnknown = ['otter'];
    mockListToolchains.mockResolvedValue(toolchains(3));

    expect(renderCount().result.current).toBeUndefined();
  });

  it.each([
    ['a list failed', () => Promise.reject(new Error('unreachable'))],
    [
      'a grant is still to be given',
      () => Promise.resolve({ status: 'grant_required', toolchains: [] }),
    ],
  ])('is unknown, not a partial count, when %s', async (_, otter) => {
    mockListToolchains.mockImplementation((installation: string) =>
      installation === 'otter' ? otter() : Promise.resolve(toolchains(2)),
    );

    const { result } = renderCount();

    await waitFor(() => expect(result.current).toBeUndefined());
    expect(mockListToolchains).toHaveBeenCalledTimes(2);
  });

  it('cannot count without the muster plugin', () => {
    mockMusterApi = undefined;

    expect(renderCount().result.current).toBeUndefined();
  });
});
