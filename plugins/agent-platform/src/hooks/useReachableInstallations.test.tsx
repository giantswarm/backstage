import { PropsWithChildren } from 'react';
import { renderHook } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  ClusterAccessStatusApi,
  ClusterAccessStatusEntry,
  clusterAccessStatusApiRef,
} from '@giantswarm/backstage-plugin-gs';
import { useReachableInstallations } from './useReachableInstallations';

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

describe('useReachableInstallations', () => {
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
