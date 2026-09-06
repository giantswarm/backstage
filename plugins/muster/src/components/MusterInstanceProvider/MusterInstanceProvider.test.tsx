import { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import type {
  InstallationInventory,
  InstallationInventoryEntry,
} from '@giantswarm/backstage-plugin-gs';
import { MusterApi, musterApiRef } from '../../apis';
import type { MusterInstallationInfo } from '../../apis/types';
import {
  MusterInstanceProvider,
  useMusterInstance,
} from './MusterInstanceProvider';

// The inventory is the provider's second data source; each test sets what it
// says and may change it between renders (a probe answering).
let mockInventory: InstallationInventory;
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallationInventory: () => mockInventory,
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

function renderInstance(initialSearch = '') {
  const musterApi = {
    listInstallations: jest.fn(async () => ({ installations: BACKEND })),
  } as unknown as MusterApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[`/agent-platform/muster/servers${initialSearch}`]}
        >
          <MusterInstanceProvider>{children}</MusterInstanceProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(
    () => ({ instance: useMusterInstance(), search: useLocation().search }),
    { wrapper },
  );
}

describe('MusterInstanceProvider installations', () => {
  beforeEach(() => window.localStorage.clear());

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
      expect(result.current.instance.isLoadingInstallations).toBe(false),
    );
    expect(result.current.instance.installations).toEqual([
      'gazelle',
      'golem',
      'snail',
    ]);
    expect(result.current.instance.installationInfos.map(i => i.source)).toEqual(
      ['configured', 'configured', 'derived'],
    );
    // The default is the home installation and is written back to the URL.
    expect(result.current.instance.activeInstallation).toBe('gazelle');
    expect(result.current.instance.activeInstallationInfo).toEqual({
      name: 'gazelle',
      requiresAuth: true,
      source: 'configured',
    });
    await waitFor(() =>
      expect(result.current.search).toBe('?installation=gazelle'),
    );
  });

  it('exposes the source of the active installation', async () => {
    mockInventory = inventory([entry('gazelle'), entry('snail')]);

    const { result } = renderInstance('?installation=snail');

    await waitFor(() =>
      expect(result.current.instance.activeInstallation).toBe('snail'),
    );
    expect(result.current.instance.activeInstallationInfo?.source).toBe(
      'derived',
    );
  });

  it('is loading, lists nothing and leaves the URL alone while the inventory has not answered', async () => {
    mockInventory = inventory([entry('gazelle', { probe: 'pending' })], {
      isLoading: true,
    });

    const { result } = renderInstance('?installation=golem');

    // Give the backend query and any write-back effect time to run.
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(result.current.instance.isLoadingInstallations).toBe(true);
    expect(result.current.instance.installations).toEqual([]);
    expect(result.current.instance.activeInstallation).toBeUndefined();
    expect(result.current.search).toBe('?installation=golem');
    expect(window.localStorage.getItem('muster-installation')).toBeNull();
  });

  it('keeps a deep-linked installation active while its probe is pending, then drops it if it has no muster', async () => {
    mockInventory = inventory([
      entry('gazelle'),
      entry('golem', { probe: 'pending', components: NONE }),
    ]);

    const { result, rerender } = renderInstance('?installation=golem');

    await waitFor(() =>
      expect(result.current.instance.isLoadingInstallations).toBe(false),
    );
    expect(result.current.instance.installations).toEqual(['gazelle', 'golem']);
    expect(result.current.instance.activeInstallation).toBe('golem');
    expect(result.current.search).toBe('?installation=golem');

    // golem's probe answers: no muster there after all.
    mockInventory = inventory([
      entry('gazelle'),
      entry('golem', { components: NONE }),
    ]);
    rerender();

    await waitFor(() =>
      expect(result.current.instance.activeInstallation).toBe('gazelle'),
    );
    expect(result.current.instance.installations).toEqual(['gazelle']);
    await waitFor(() =>
      expect(result.current.search).toBe('?installation=gazelle'),
    );
  });

  it('keeps a deep-linked installation once its probe answers with muster', async () => {
    mockInventory = inventory([
      entry('gazelle'),
      entry('golem', { probe: 'pending', components: NONE }),
    ]);

    const { result, rerender } = renderInstance('?installation=golem');
    await waitFor(() =>
      expect(result.current.instance.activeInstallation).toBe('golem'),
    );

    mockInventory = inventory([entry('gazelle'), entry('golem')]);
    rerender();

    await waitFor(() =>
      expect(result.current.instance.installations).toEqual([
        'gazelle',
        'golem',
      ]),
    );
    expect(result.current.instance.activeInstallation).toBe('golem');
    expect(result.current.search).toBe('?installation=golem');
  });

  it('lists the backend installations as they are when the portal has no inventory', async () => {
    // No gs.installations: the legacy single-installation setup.
    mockInventory = inventory([], { home: undefined });

    const { result } = renderInstance();

    await waitFor(() =>
      expect(result.current.instance.isLoadingInstallations).toBe(false),
    );
    expect(result.current.instance.installations).toEqual([
      'golem',
      'gazelle',
      'wombat',
      'snail',
    ]);
    expect(result.current.instance.activeInstallation).toBe('golem');
  });
});
