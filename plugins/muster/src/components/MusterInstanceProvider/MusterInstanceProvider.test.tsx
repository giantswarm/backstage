import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import {
  InventoryProbeError,
  type InstallationInventory,
  type InstallationInventoryEntry,
  type InstallationScope,
} from '@giantswarm/backstage-plugin-gs';
import { MusterApi, musterApiRef } from '../../apis';
import type { MusterInstallationInfo } from '../../apis/types';
import {
  MusterInstanceProvider,
  useMusterInstance,
} from './MusterInstanceProvider';

// The inventory is the provider's second data source; each test sets what it
// says and may change it between renders (a probe answering). The section's
// installation scope is the third: `'all'` or a pinned installation, set here
// or through the provider's own `setActiveInstallation`.
let mockInventory: InstallationInventory;
let mockScope: InstallationScope = 'all';
const mockSetScope = jest.fn((next: InstallationScope) => {
  mockScope = next;
});
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  // The real module for `selectInventoryFailure`; the two hooks are the
  // provider's data sources and are what each test sets.
  ...jest.requireActual('@giantswarm/backstage-plugin-gs'),
  ALL_INSTALLATIONS: 'all',
  useInstallationInventory: () => mockInventory,
  useInstallationScope: () => ({
    scope: mockScope,
    setScope: mockSetScope,
    installations: [],
    home: mockInventory.home,
    isSingleInstallation: false,
    isLoading: false,
  }),
}));

// The CRD reads are somebody else's question here.
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: () => ({
    resources: [],
    errors: [],
    queries: [],
    isLoading: false,
    retry: jest.fn(),
  }),
  useShowErrors: () => undefined,
}));

const NONE = { kagent: false, muster: false, kserve: false, capi: false };
const MUSTER = { ...NONE, muster: true };

function entry(
  installation: string,
  overrides: Partial<InstallationInventoryEntry> = {},
): InstallationInventoryEntry {
  return {
    installation,
    home: installation === 'gazelle',
    accessState: 'healthy',
    probe: 'answered',
    components: MUSTER,
    ...overrides,
  };
}

function inventory(
  entries: InstallationInventoryEntry[],
  overrides: Partial<InstallationInventory> = {},
): InstallationInventory {
  return {
    entries,
    home: 'gazelle',
    isLoading: false,
    isProbing: entries.some(e => e.probe === 'pending'),
    installationsWith: component =>
      entries
        .filter(
          e =>
            e.probe === 'answered' &&
            e.components[component] &&
            e.accessState === 'healthy',
        )
        .map(e => e.installation),
    refresh: jest.fn(),
    ...overrides,
  };
}

// The backend lists golem first: the provider, not the backend, puts home first.
const BACKEND: MusterInstallationInfo[] = [
  { name: 'golem', requiresAuth: true, source: 'configured' },
  { name: 'gazelle', requiresAuth: true, source: 'configured' },
  { name: 'wombat', requiresAuth: true, source: 'derived' },
  { name: 'snail', requiresAuth: true, source: 'derived' },
];

function renderInstance() {
  const musterApi = {
    listInstallations: jest.fn(async () => ({ installations: BACKEND })),
  } as unknown as MusterApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>
        <MusterInstanceProvider>{children}</MusterInstanceProvider>
      </QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useMusterInstance(), { wrapper });
}

describe('MusterInstanceProvider installations', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockScope = 'all';
    mockSetScope.mockClear();
  });

  it('lists the backend installations whose inventory has muster, home first, with their backend info', async () => {
    mockInventory = inventory([
      entry('gazelle'),
      entry('golem'),
      // Derived by the backend, no muster on the cluster.
      entry('wombat', { components: NONE }),
      entry('snail'),
    ]);

    const { result } = renderInstance();

    await waitFor(() =>
      expect(result.current.isLoadingInstallations).toBe(false),
    );
    expect(result.current.installations).toEqual(['gazelle', 'golem', 'snail']);
    expect(result.current.installationInfos.map(i => i.source)).toEqual([
      'configured',
      'configured',
      'derived',
    ]);
    // Under "All installations" the home muster is shown -- a resolution, not
    // a choice: nothing is pinned for the section. The scope it was resolved
    // from and the home travel with it, for the views' note.
    expect(result.current.activeInstallation).toBe('gazelle');
    expect(result.current.scope).toBe('all');
    expect(result.current.homeInstallation).toBe('gazelle');
    expect(result.current.isSingleInstallation).toBe(false);
    expect(result.current.activeInstallationInfo).toEqual({
      name: 'gazelle',
      requiresAuth: true,
      source: 'configured',
    });
    expect(mockSetScope).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('muster-installation')).toBeNull();
  });

  it('follows a pinned scope and exposes the source of the active installation', async () => {
    mockInventory = inventory([entry('gazelle'), entry('snail')]);
    mockScope = 'snail';

    const { result } = renderInstance();

    await waitFor(() =>
      expect(result.current.activeInstallation).toBe('snail'),
    );
    expect(result.current.scope).toBe('snail');
    expect(result.current.activeInstallationInfo?.source).toBe('derived');
  });

  it('pins the section scope when an installation is chosen here', async () => {
    mockInventory = inventory([entry('gazelle'), entry('golem')]);

    const { result, rerender } = renderInstance();
    await waitFor(() =>
      expect(result.current.activeInstallation).toBe('gazelle'),
    );

    act(() => result.current.setActiveInstallation('golem'));
    rerender();

    expect(mockSetScope).toHaveBeenCalledWith('golem');
    await waitFor(() =>
      expect(result.current.activeInstallation).toBe('golem'),
    );
  });

  it('is loading, lists nothing and has no active installation while the inventory has not answered', async () => {
    mockInventory = inventory([entry('gazelle', { probe: 'pending' })], {
      isLoading: true,
    });
    mockScope = 'golem';

    const { result } = renderInstance();

    // Give the backend query time to answer.
    await act(() => new Promise(resolve => setTimeout(resolve, 30)));
    expect(result.current.isLoadingInstallations).toBe(true);
    expect(result.current.installations).toEqual([]);
    expect(result.current.activeInstallation).toBeUndefined();
    expect(mockSetScope).not.toHaveBeenCalled();
  });

  it('keeps a pinned installation active while its probe is pending, then falls back to the home if it has no muster', async () => {
    mockInventory = inventory([
      entry('gazelle'),
      entry('golem', { probe: 'pending', components: NONE }),
    ]);
    mockScope = 'golem';

    const { result, rerender } = renderInstance();

    await waitFor(() =>
      expect(result.current.isLoadingInstallations).toBe(false),
    );
    expect(result.current.installations).toEqual(['gazelle', 'golem']);
    expect(result.current.activeInstallation).toBe('golem');

    // golem's probe answers: no muster there after all.
    mockInventory = inventory([
      entry('gazelle'),
      entry('golem', { components: NONE }),
    ]);
    rerender();

    await waitFor(() =>
      expect(result.current.activeInstallation).toBe('gazelle'),
    );
    expect(result.current.installations).toEqual(['gazelle']);
    // The scope is the section's; the provider does not rewrite it.
    expect(mockSetScope).not.toHaveBeenCalled();
  });

  it('keeps a pinned installation once its probe answers with muster', async () => {
    mockInventory = inventory([
      entry('gazelle'),
      entry('golem', { probe: 'pending', components: NONE }),
    ]);
    mockScope = 'golem';

    const { result, rerender } = renderInstance();
    await waitFor(() =>
      expect(result.current.activeInstallation).toBe('golem'),
    );

    mockInventory = inventory([entry('gazelle'), entry('golem')]);
    rerender();

    await waitFor(() =>
      expect(result.current.installations).toEqual(['gazelle', 'golem']),
    );
    expect(result.current.activeInstallation).toBe('golem');
  });

  it('lists nothing, is not loading, and explains the home installation whose probe was refused', async () => {
    // The incident: the home's `GET /apis` answered 401 (the ID token carried
    // no audience the apiserver accepts). The section used to end up with no
    // installation, no gate and no error -- the dashboard on its progress bar.
    const error = new InventoryProbeError('gazelle', 401, '');
    mockInventory = inventory([
      entry('gazelle', { probe: 'failed', components: NONE, error }),
      entry('golem', { components: NONE }),
    ]);

    const { result } = renderInstance();

    await waitFor(() =>
      expect(result.current.isLoadingInstallations).toBe(false),
    );
    expect(result.current.installations).toEqual([]);
    expect(result.current.activeInstallation).toBeUndefined();
    expect(result.current.inventoryFailure).toEqual({
      installation: 'gazelle',
      kind: 'unauthorized',
      error,
    });

    act(() => result.current.refreshInventory());
    expect(mockInventory.refresh).toHaveBeenCalledTimes(1);
  });

  it("explains the pinned installation's failure over the home's, and the home's when the pinned one runs no muster", async () => {
    const unauthorized = new InventoryProbeError('gazelle', 401, '');
    const forbidden = new InventoryProbeError('golem', 403, '');
    mockInventory = inventory([
      entry('gazelle', {
        probe: 'failed',
        components: NONE,
        error: unauthorized,
      }),
      entry('golem', { probe: 'failed', components: NONE, error: forbidden }),
      entry('wombat', { components: NONE }),
    ]);
    mockScope = 'golem';

    const { result, rerender } = renderInstance();
    await waitFor(() =>
      expect(result.current.isLoadingInstallations).toBe(false),
    );
    expect(result.current.inventoryFailure).toMatchObject({
      installation: 'golem',
      kind: 'forbidden',
    });

    // Pinned to an installation that answered without muster: the section
    // falls back to the home, and the home's refusal is why it shows nothing.
    mockScope = 'wombat';
    rerender();
    await waitFor(() =>
      expect(result.current.inventoryFailure).toMatchObject({
        installation: 'gazelle',
        kind: 'unauthorized',
      }),
    );
    expect(result.current.activeInstallation).toBeUndefined();
  });

  it('has no failure to explain while the home probe is pending or once it answered', async () => {
    mockInventory = inventory([entry('gazelle'), entry('golem')]);

    const { result } = renderInstance();
    await waitFor(() =>
      expect(result.current.activeInstallation).toBe('gazelle'),
    );

    expect(result.current.inventoryFailure).toBeUndefined();
  });

  it('lists the backend installations as they are when the portal has no inventory', async () => {
    // No gs.installations: the legacy single-installation setup.
    mockInventory = inventory([], { home: undefined });

    const { result } = renderInstance();

    await waitFor(() =>
      expect(result.current.isLoadingInstallations).toBe(false),
    );
    expect(result.current.installations).toEqual([
      'golem',
      'gazelle',
      'wombat',
      'snail',
    ]);
    expect(result.current.activeInstallation).toBe('golem');
  });
});
