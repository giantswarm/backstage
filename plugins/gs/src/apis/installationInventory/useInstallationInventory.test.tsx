import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { mockApis, TestApiProvider } from '@backstage/frontend-test-utils';
import { configApiRef } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ClusterAccessStatusApi,
  clusterAccessStatusApiRef,
  ClusterAccessStatusStore,
} from '../clusterAccessStatus';
import {
  __resetInstallationsConfigForTests,
  setInstallationsConfig,
} from '../installations';
import { INVENTORY_PROBE_PATH } from './probeInstallationInventory';
import { installationInventoryQueryKey } from './queryKey';
import {
  orderInstallations,
  useInstallationInventory,
} from './useInstallationInventory';

/** Per-installation canned `/apis` answers. */
type Answer =
  | { status: 200; groups: string[] }
  | { status: 200; body: unknown }
  | { status: 200; deferred: Promise<string[]> }
  | { status: 401 | 403 | 404 | 500 | 502 };

function apiGroupList(names: string[]) {
  return {
    kind: 'APIGroupList',
    apiVersion: 'v1',
    groups: names.map(name => ({
      name,
      versions: [{ groupVersion: `${name}/v1`, version: 'v1' }],
      preferredVersion: { groupVersion: `${name}/v1`, version: 'v1' },
    })),
  };
}

function fakeKubernetesApi(answers: Record<string, Answer>) {
  const proxy = jest.fn(async ({ clusterName }: { clusterName: string }) => {
    const answer = answers[clusterName];
    if (!answer) {
      throw new Error(`unexpected probe of ${clusterName}`);
    }
    if (answer.status !== 200) {
      return {
        ok: false,
        status: answer.status,
        statusText: '',
        json: async () => ({}),
      } as unknown as Response;
    }
    let body: unknown;
    if ('body' in answer) {
      body = answer.body;
    } else if ('deferred' in answer) {
      body = apiGroupList(await answer.deferred);
    } else {
      body = apiGroupList(answer.groups);
    }
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as unknown as Response;
  });
  return { proxy };
}

const KAGENT_AND_KSERVE = ['apps', 'kagent.dev', 'serving.kserve.io'];

type SetupOptions = {
  /** Configured installations, in config order. `golem` is the home. */
  installations?: string[];
  answers?: Record<string, Answer>;
  mainProvider?: string;
  /** Access states recorded before the hook mounts. */
  states?: Record<string, 'healthy' | 'degraded' | 'connecting'>;
  queryClient?: QueryClient;
};

function record(
  statusApi: ClusterAccessStatusApi,
  installation: string,
  state: 'healthy' | 'degraded' | 'connecting' | 'session-expired',
) {
  switch (state) {
    case 'healthy':
      statusApi.recordHealthy(installation);
      break;
    case 'degraded':
      statusApi.recordDegraded(installation, 'down');
      break;
    case 'session-expired':
      statusApi.recordSessionExpired(installation, 'expired');
      break;
    default:
      statusApi.recordConnecting(installation);
  }
}

function setup({
  installations = ['wombat', 'golem', 'snail'],
  answers = {
    golem: { status: 200, groups: KAGENT_AND_KSERVE },
    wombat: { status: 200, groups: ['apps'] },
    snail: { status: 200, groups: ['kagent.dev'] },
  },
  mainProvider = 'oidc-golem',
  states,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
}: SetupOptions = {}) {
  setInstallationsConfig(
    installations.map(name => ({
      name,
      pipeline: name === 'snail' ? 'testing' : 'stable',
      oidcTokenProvider: `oidc-${name}`,
    })),
  );
  const statusApi = ClusterAccessStatusStore.create();
  for (const [installation, state] of Object.entries(states ?? {})) {
    record(statusApi, installation, state);
  }
  const kubernetesApi = fakeKubernetesApi(answers);
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [
          configApiRef,
          mockApis.config({ data: { gs: { authProvider: mainProvider } } }),
        ],
        [kubernetesApiRef, kubernetesApi],
        [clusterAccessStatusApiRef, statusApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return {
    statusApi,
    proxy: kubernetesApi.proxy,
    queryClient,
    ...renderHook(() => useInstallationInventory(), { wrapper }),
  };
}

const allHealthy = {
  golem: 'healthy',
  wombat: 'healthy',
  snail: 'healthy',
} as const;

/**
 * The status store delivers its emissions on a microtask (zen-observable), so
 * a synchronous `act(() => statusApi.record…())` has not reached the hook's
 * state yet; this lets it land.
 */
const settle = () =>
  act(async () => {
    await Promise.resolve();
  });

const names = (result: { current: { entries: { installation: string }[] } }) =>
  result.current.entries.map(entry => entry.installation);

const probesOf = (result: {
  current: { entries: { installation: string; probe: string }[] };
}) =>
  Object.fromEntries(
    result.current.entries.map(entry => [entry.installation, entry.probe]),
  );

describe('orderInstallations', () => {
  it('puts the home first, then settled probes in settle order, then config order', () => {
    const settled = new Map([
      ['snail', 0],
      ['wombat', 1],
    ]);
    expect(
      orderInstallations(
        ['wombat', 'golem', 'snail', 'yak', 'emu'],
        'golem',
        settled,
      ),
    ).toEqual(['golem', 'snail', 'wombat', 'yak', 'emu']);
  });

  it('keeps config order without a home or any settled probe', () => {
    expect(
      orderInstallations(['wombat', 'golem', 'snail'], undefined, new Map()),
    ).toEqual(['wombat', 'golem', 'snail']);
  });
});

describe('useInstallationInventory', () => {
  beforeEach(() => __resetInstallationsConfigForTests());
  afterEach(() => __resetInstallationsConfigForTests());

  it('flags the home installation (oidcTokenProvider = gs.authProvider) and lists it first', async () => {
    const { result } = setup({ states: allHealthy });

    await waitFor(() => expect(result.current.isProbing).toBe(false));

    expect(result.current.home).toBe('golem');
    expect(names(result)[0]).toBe('golem');
    expect(result.current.entries[0]).toMatchObject({
      installation: 'golem',
      home: true,
      pipeline: 'stable',
      accessState: 'healthy',
      probe: 'answered',
      components: { kagent: true, muster: false, kserve: true, capi: false },
    });
    expect(result.current.entries.slice(1).every(entry => !entry.home)).toBe(
      true,
    );
  });

  it('orders the other installations as their access probes settle', async () => {
    const { result, statusApi } = setup();
    await settle();

    // Nothing settled yet: home, then config order.
    expect(names(result)).toEqual(['golem', 'wombat', 'snail']);

    act(() => statusApi.recordHealthy('snail'));
    act(() => statusApi.recordHealthy('wombat'));
    act(() => statusApi.recordHealthy('golem'));

    await waitFor(() => expect(result.current.isProbing).toBe(false));
    expect(names(result)).toEqual(['golem', 'snail', 'wombat']);
  });

  it('probes the home in the foreground and every other installation in the background', async () => {
    const { result, proxy } = setup({ states: allHealthy });

    await waitFor(() => expect(result.current.isProbing).toBe(false));

    expect(proxy).toHaveBeenCalledTimes(3);
    expect(proxy).toHaveBeenCalledWith({
      clusterName: 'golem',
      path: INVENTORY_PROBE_PATH,
      background: false,
    });
    expect(proxy).toHaveBeenCalledWith({
      clusterName: 'wombat',
      path: INVENTORY_PROBE_PATH,
      background: true,
    });
    expect(proxy).toHaveBeenCalledWith({
      clusterName: 'snail',
      path: INVENTORY_PROBE_PATH,
      background: true,
    });
    expect(INVENTORY_PROBE_PATH).toBe('/apis');
  });

  it('never asks an installation whose access is not healthy', async () => {
    const { result, proxy, statusApi } = setup({
      states: { golem: 'healthy', wombat: 'degraded', snail: 'connecting' },
    });

    await waitFor(() => expect(probesOf(result).golem).toBe('answered'));

    expect(proxy).toHaveBeenCalledTimes(1);
    expect(proxy.mock.calls[0][0].clusterName).toBe('golem');
    expect(result.current.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          installation: 'wombat',
          accessState: 'degraded',
          probe: 'pending',
          components: {
            kagent: false,
            muster: false,
            kserve: false,
            capi: false,
          },
        }),
        expect.objectContaining({
          installation: 'snail',
          accessState: 'connecting',
          probe: 'pending',
        }),
      ]),
    );
    // Home answered: not loading. snail may still answer: still probing.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isProbing).toBe(true);

    // Once snail's access probe fails too, nothing can still answer.
    act(() => statusApi.recordDegraded('snail', 'down'));
    await settle();
    expect(result.current.isProbing).toBe(false);
    expect(proxy).toHaveBeenCalledTimes(1);
  });

  it('stores each answer under the versioned per-installation key', async () => {
    const { result, queryClient } = setup({ states: allHealthy });

    await waitFor(() => expect(result.current.isProbing).toBe(false));

    expect(installationInventoryQueryKey('golem')).toEqual([
      'gs',
      'installation-inventory',
      'v1',
      'golem',
    ]);
    expect(
      queryClient.getQueryData(installationInventoryQueryKey('golem')),
    ).toEqual({ kagent: true, muster: false, kserve: true, capi: false });
    expect(
      queryClient.getQueryData(installationInventoryQueryKey('wombat')),
    ).toEqual({ kagent: false, muster: false, kserve: false, capi: false });
  });

  it('lists the installations with a component: answered, present and healthy, home first', async () => {
    const { result, statusApi } = setup({
      installations: ['wombat', 'snail', 'golem'],
      states: allHealthy,
    });

    await waitFor(() => expect(result.current.isProbing).toBe(false));

    expect(result.current.installationsWith('kagent')).toEqual([
      'golem',
      'snail',
    ]);
    expect(result.current.installationsWith('kserve')).toEqual(['golem']);
    expect(result.current.installationsWith('muster')).toEqual([]);
    expect(result.current.installationsWith('capi')).toEqual([]);

    // An answered installation that loses access leaves the list at once, even
    // though its (cached) answer stays.
    act(() => statusApi.recordSessionExpired('snail', 'expired'));
    await settle();
    expect(result.current.installationsWith('kagent')).toEqual(['golem']);
    expect(probesOf(result).snail).toBe('answered');
  });

  it('treats a 404 or 403 on /apis as a failed probe, never as "no components"', async () => {
    const { result } = setup({
      answers: {
        golem: { status: 200, groups: KAGENT_AND_KSERVE },
        wombat: { status: 404 },
        snail: { status: 403 },
      },
      states: allHealthy,
    });

    await waitFor(() => expect(result.current.isProbing).toBe(false));

    const byName = Object.fromEntries(
      result.current.entries.map(entry => [entry.installation, entry]),
    );
    expect(byName.wombat.probe).toBe('failed');
    expect(byName.wombat.error?.name).toBe('NotFoundError');
    expect(byName.wombat.error?.message).toContain('HTTP 404');
    expect(byName.snail.probe).toBe('failed');
    expect(byName.snail.error?.name).toBe('ForbiddenError');
    expect(result.current.installationsWith('kagent')).toEqual(['golem']);
    expect(result.current.isLoading).toBe(false);
  });

  it('treats an answer that is not an API group list as a failed probe', async () => {
    const { result } = setup({
      answers: {
        golem: { status: 200, body: { message: 'not a group list' } },
        wombat: { status: 200, groups: [] },
        snail: { status: 502 },
      },
      states: allHealthy,
    });

    await waitFor(() => expect(result.current.isProbing).toBe(false));

    expect(probesOf(result)).toEqual({
      golem: 'failed',
      wombat: 'answered',
      snail: 'failed',
    });
    expect(result.current.entries[0].error?.name).toBe(
      'ApiGroupListShapeError',
    );
  });

  it('reads a persisted entry of another shape as not answered yet and probes again', async () => {
    // The agent-platform QueryClientProvider persists this cache across
    // releases (backstage#2264): whatever an older release left under the key
    // must not be read as an answer.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(installationInventoryQueryKey('golem'), {
      hasInferenceServices: true,
    });
    queryClient.setQueryData(installationInventoryQueryKey('snail'), [
      'kagent.dev',
    ]);
    // A valid, fresh entry is served from the cache and not probed again.
    queryClient.setQueryData(installationInventoryQueryKey('wombat'), {
      kagent: false,
      muster: true,
      kserve: false,
      capi: false,
    });

    const { result, proxy } = setup({ states: allHealthy, queryClient });

    // Before any fetch settles: the foreign shapes are pending, the valid one
    // answered.
    expect(probesOf(result)).toEqual({
      golem: 'pending',
      wombat: 'answered',
      snail: 'pending',
    });
    expect(result.current.installationsWith('kagent')).toEqual([]);
    expect(result.current.installationsWith('muster')).toEqual(['wombat']);

    await waitFor(() => expect(result.current.isProbing).toBe(false));

    expect(probesOf(result)).toEqual({
      golem: 'answered',
      wombat: 'answered',
      snail: 'answered',
    });
    expect(result.current.installationsWith('kagent')).toEqual([
      'golem',
      'snail',
    ]);
    const probed = proxy.mock.calls.map(call => call[0].clusterName).sort();
    expect(probed).toEqual(['golem', 'snail']);
  });

  it('probes an installation again when it turns healthy again', async () => {
    const { result, proxy, statusApi } = setup({ states: allHealthy });
    await waitFor(() => expect(result.current.isProbing).toBe(false));
    expect(proxy).toHaveBeenCalledTimes(3);

    // degraded -> healthy
    act(() => statusApi.recordDegraded('snail', 'down'));
    act(() => statusApi.recordHealthy('snail'));
    await waitFor(() => expect(proxy).toHaveBeenCalledTimes(4));
    expect(proxy.mock.calls[3][0].clusterName).toBe('snail');

    // dropped from the status set (signed out) -> healthy
    act(() => statusApi.remove('wombat'));
    await settle();
    expect(result.current.entries).toContainEqual(
      expect.objectContaining({
        installation: 'wombat',
        accessState: 'unknown',
      }),
    );
    act(() => statusApi.recordHealthy('wombat'));
    await waitFor(() => expect(proxy).toHaveBeenCalledTimes(5));
    expect(proxy.mock.calls[4][0].clusterName).toBe('wombat');

    // Staying healthy across a re-probe of the access state is not "again".
    act(() => statusApi.recordHealthy('golem'));
    await settle();
    expect(proxy).toHaveBeenCalledTimes(5);
  });

  it('re-probes the healthy installations on refresh()', async () => {
    const { result, proxy } = setup({
      states: { golem: 'healthy', wombat: 'degraded', snail: 'healthy' },
    });
    await waitFor(() => expect(result.current.isProbing).toBe(false));
    expect(proxy).toHaveBeenCalledTimes(2);

    act(() => result.current.refresh());

    await waitFor(() => expect(proxy).toHaveBeenCalledTimes(4));
    const probed = proxy.mock.calls
      .slice(2)
      .map(call => call[0].clusterName)
      .sort();
    expect(probed).toEqual(['golem', 'snail']);
  });

  it('is loading until the home installation has answered', async () => {
    let answerHome: (groups: string[]) => void = () => {};
    const deferred = new Promise<string[]>(resolve => {
      answerHome = resolve;
    });
    const { result } = setup({
      answers: {
        golem: { status: 200, deferred },
        wombat: { status: 200, groups: ['apps'] },
        snail: { status: 200, groups: ['kagent.dev'] },
      },
      states: allHealthy,
    });

    await waitFor(() => expect(probesOf(result).snail).toBe('answered'));
    // The others answered; the home has not: still loading.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isProbing).toBe(true);

    act(() => answerHome(KAGENT_AND_KSERVE));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isProbing).toBe(false);
  });

  it('is loading while nothing about access is known yet, and not once it is', async () => {
    const { result, statusApi } = setup();
    await settle();

    // Installations configured, status set empty: the connector has not seeded
    // it yet. Report loading rather than an empty fleet.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isProbing).toBe(true);
    expect(
      result.current.entries.every(entry => entry.accessState === 'unknown'),
    ).toBe(true);

    // Only degraded installations known, home absent: nothing can answer.
    act(() => statusApi.recordDegraded('wombat', 'down'));
    await settle();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isProbing).toBe(false);
  });

  it('is not loading without a home installation once access states are known', async () => {
    const { result } = setup({
      mainProvider: 'oidc-elsewhere',
      states: allHealthy,
    });

    await waitFor(() => expect(result.current.isProbing).toBe(false));

    expect(result.current.home).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.entries.every(entry => !entry.home)).toBe(true);
    // Config order, since nobody is home and every probe settled at once.
    expect(names(result)).toEqual(['golem', 'snail', 'wombat']);
  });

  it('reports nothing to load with no installations configured', async () => {
    const { result } = setup({ installations: [] });
    await settle();

    expect(result.current.entries).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isProbing).toBe(false);
  });
});

describe('useInstallationInventory while access probes settle', () => {
  beforeEach(() => __resetInstallationsConfigForTests());
  afterEach(() => __resetInstallationsConfigForTests());

  it('keeps probing while an installation with a cached answer is still connecting', async () => {
    // A repeat visit: snail's inventory answer is in the (persisted) cache, but
    // its cluster-access probe has not settled yet. `installationsWith` cannot
    // list it (not healthy), so a tab pinned to snail has nothing to query --
    // for now. It must read as still settling, not as "no agents here".
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(installationInventoryQueryKey('snail'), {
      kagent: true,
      muster: false,
      kserve: false,
      capi: false,
    });
    const { result, statusApi, proxy } = setup({
      queryClient,
      states: { golem: 'healthy', wombat: 'degraded', snail: 'connecting' },
    });

    await waitFor(() => expect(probesOf(result).golem).toBe('answered'));
    expect(probesOf(result).snail).toBe('answered');
    expect(result.current.installationsWith('kagent')).toEqual(['golem']);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isProbing).toBe(true);

    act(() => statusApi.recordHealthy('snail'));
    await settle();

    await waitFor(() => expect(result.current.isProbing).toBe(false));
    expect(result.current.installationsWith('kagent')).toEqual([
      'golem',
      'snail',
    ]);
    // The cached answer is fresh: no probe went to snail.
    expect(proxy.mock.calls.map(call => call[0].clusterName)).toEqual([
      'golem',
    ]);
  });
});
