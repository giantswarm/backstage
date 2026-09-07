import { PropsWithChildren } from 'react';
import { renderHook } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  ClusterAccessStatusApi,
  ClusterAccessStatusEntry,
  clusterAccessStatusApiRef,
} from '@giantswarm/backstage-plugin-gs';
import {
  homeFirst,
  useReachableInstallations,
} from './useReachableInstallations';

// The home installation comes from gs (`oidcTokenProvider` = `gs.authProvider`);
// here it is whatever the test says. `mock`-prefixed, as jest requires inside a
// mock factory.
let mockHome: string | undefined;

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-gs'),
  useHomeInstallation: () => ({
    home: mockHome ? { name: mockHome } : undefined,
    isLoading: false,
  }),
}));

function fakeStatusApi(
  snapshot: ClusterAccessStatusEntry[],
): ClusterAccessStatusApi {
  return {
    getSnapshot: () => snapshot,
    // The hook only reads the initial snapshot in these tests; a no-op
    // subscription is enough.
    status$: () => ({
      subscribe: () => ({ unsubscribe() {} }),
    }),
    recordConnecting() {},
    recordHealthy() {},
    recordDegraded() {},
    recordSessionExpired() {},
    remove() {},
  } as unknown as ClusterAccessStatusApi;
}

function renderWith(
  allInstallations: string[],
  snapshot: ClusterAccessStatusEntry[],
) {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[[clusterAccessStatusApiRef, fakeStatusApi(snapshot)]]}
    >
      {children}
    </TestApiProvider>
  );
  return renderHook(() => useReachableInstallations(allInstallations), {
    wrapper,
  });
}

const entry = (
  installation: string,
  state: ClusterAccessStatusEntry['state'],
): ClusterAccessStatusEntry => ({ installation, state, lastChecked: 0 });

describe('homeFirst', () => {
  it('moves the home to the front and keeps the rest in order', () => {
    expect(homeFirst(['gazelle', 'graveler', 'grizzly'], 'graveler')).toEqual([
      'graveler',
      'gazelle',
      'grizzly',
    ]);
  });

  it('leaves the order alone without a home, or with one that is not listed', () => {
    expect(homeFirst(['gazelle', 'graveler'], undefined)).toEqual([
      'gazelle',
      'graveler',
    ]);
    expect(homeFirst(['gazelle', 'graveler'], 'grizzly')).toEqual([
      'gazelle',
      'graveler',
    ]);
  });
});

describe('useReachableInstallations', () => {
  beforeEach(() => {
    mockHome = undefined;
  });

  it('puts the home installation first, then the others in config order', () => {
    mockHome = 'graveler';
    const { result } = renderWith(
      ['gazelle', 'graveler', 'grizzly'],
      [
        entry('gazelle', 'healthy'),
        entry('graveler', 'healthy'),
        entry('grizzly', 'healthy'),
      ],
    );

    expect(result.current.installations).toEqual([
      'graveler',
      'gazelle',
      'grizzly',
    ]);
  });

  it('still drops the home when it is not healthy', () => {
    mockHome = 'graveler';
    const { result } = renderWith(
      ['gazelle', 'graveler', 'grizzly'],
      [
        entry('gazelle', 'healthy'),
        entry('graveler', 'session-expired'),
        entry('grizzly', 'healthy'),
      ],
    );

    expect(result.current.installations).toEqual(['gazelle', 'grizzly']);
  });

  it('puts the home first in the fallback too, before any status is known', () => {
    mockHome = 'grizzly';
    const { result } = renderWith(['gazelle', 'graveler', 'grizzly'], []);

    expect(result.current.installations).toEqual([
      'grizzly',
      'gazelle',
      'graveler',
    ]);
  });

  it('keeps only healthy installations', () => {
    const { result } = renderWith(
      ['gazelle', 'graveler', 'grizzly', 'gerbil'],
      [
        entry('gazelle', 'healthy'),
        entry('graveler', 'connecting'),
        entry('grizzly', 'degraded'),
        entry('gerbil', 'session-expired'),
      ],
    );

    // connecting/degraded/session-expired are all excluded now — only a
    // confirmed apiserver round-trip counts as reachable.
    expect(result.current.installations).toEqual(['gazelle']);
    // A connecting probe is still in flight, so the set may still grow.
    expect(result.current.isProbing).toBe(true);
  });

  it('drops installations absent from the status set', () => {
    const { result } = renderWith(
      ['gazelle', 'graveler'],
      [entry('gazelle', 'healthy')],
    );

    expect(result.current.installations).toEqual(['gazelle']);
    expect(result.current.isProbing).toBe(false);
  });

  it('preserves the configured order of installations', () => {
    const { result } = renderWith(
      ['gazelle', 'graveler'],
      [entry('graveler', 'healthy'), entry('gazelle', 'healthy')],
    );

    expect(result.current.installations).toEqual(['gazelle', 'graveler']);
  });

  it('falls back to all installations until any status is known', () => {
    const { result } = renderWith(['gazelle', 'graveler', 'grizzly'], []);

    expect(result.current.installations).toEqual([
      'gazelle',
      'graveler',
      'grizzly',
    ]);
    expect(result.current.isProbing).toBe(true);
  });
});
