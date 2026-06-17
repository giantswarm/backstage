import { ClusterAccessStatusStore } from './ClusterAccessStatusStore';
import { ClusterAccessStatusEntry } from './types';

/** Let zen-observable flush its (next-tick) deliveries. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('ClusterAccessStatusStore', () => {
  it('records the latest state per installation, sorted by name', () => {
    const store = ClusterAccessStatusStore.create();

    store.recordHealthy('golem');
    store.recordDegraded('alpha', 'API unreachable (timeout)');
    store.recordSessionExpired('golem', 'Your session expired');

    expect(store.getSnapshot()).toEqual([
      expect.objectContaining({ installation: 'alpha', state: 'degraded' }),
      expect.objectContaining({
        installation: 'golem',
        state: 'session-expired',
        reason: 'Your session expired',
      }),
    ]);
  });

  it('replays the latest snapshot to new subscribers', async () => {
    const store = ClusterAccessStatusStore.create();
    store.recordHealthy('golem');

    const snapshots: ClusterAccessStatusEntry[][] = [];
    const subscription = store.status$().subscribe(s => snapshots.push(s));
    await flush();

    expect(snapshots.at(-1)).toEqual([
      expect.objectContaining({ installation: 'golem', state: 'healthy' }),
    ]);
    subscription.unsubscribe();
  });

  it('notifies subscribers only when the state actually changes', async () => {
    const store = ClusterAccessStatusStore.create();
    const snapshots: ClusterAccessStatusEntry[][] = [];
    const subscription = store.status$().subscribe(s => snapshots.push(s));
    await flush();
    const baseline = snapshots.length;

    store.recordDegraded('golem', 'boom');
    await flush();
    expect(snapshots.length).toBe(baseline + 1);

    // Same state + reason -- no churn.
    store.recordDegraded('golem', 'boom');
    await flush();
    expect(snapshots.length).toBe(baseline + 1);

    // Reason change -- emits again.
    store.recordDegraded('golem', 'different');
    await flush();
    expect(snapshots.length).toBe(baseline + 2);

    subscription.unsubscribe();

    // No emissions after unsubscribe.
    store.recordHealthy('golem');
    await flush();
    expect(snapshots.length).toBe(baseline + 2);
  });
});
