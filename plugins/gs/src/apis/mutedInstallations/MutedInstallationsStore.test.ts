import { MutedInstallationsApi } from './types';
import { MutedInstallationsStore } from './MutedInstallationsStore';

const STORAGE_KEY = 'gs-muted-installations';

// zen-observable delivers the replayed initial value on a microtask, so tests
// flush with a tick after each subscribe/change before asserting emissions.
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function collect(api: MutedInstallationsApi): {
  emissions: string[][];
  unsubscribe: () => void;
} {
  const emissions: string[][] = [];
  const subscription = api.muted$().subscribe(snapshot => {
    emissions.push(snapshot);
  });
  return { emissions, unsubscribe: () => subscription.unsubscribe() };
}

describe('MutedInstallationsStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts empty when nothing is persisted', () => {
    const store = MutedInstallationsStore.create();
    expect(store.getSnapshot()).toEqual([]);
    expect(store.isMuted('alpha')).toBe(false);
  });

  it('loads a previously-persisted set on construction', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['beta', 'alpha']));
    const store = MutedInstallationsStore.create();
    expect(store.getSnapshot()).toEqual(['alpha', 'beta']); // sorted
    expect(store.isMuted('beta')).toBe(true);
  });

  it('mutes an installation and persists it', () => {
    const store = MutedInstallationsStore.create();
    store.setMuted('alpha', true);

    expect(store.isMuted('alpha')).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual([
      'alpha',
    ]);
  });

  it('unmutes an installation', () => {
    const store = MutedInstallationsStore.create();
    store.setMuted('alpha', true);
    store.setMuted('alpha', false);

    expect(store.isMuted('alpha')).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual([]);
  });

  it('toggles an installation', () => {
    const store = MutedInstallationsStore.create();
    store.toggle('alpha');
    expect(store.isMuted('alpha')).toBe(true);
    store.toggle('alpha');
    expect(store.isMuted('alpha')).toBe(false);
  });

  it('replays the snapshot to a new subscriber and emits on change', async () => {
    const store = MutedInstallationsStore.create();
    const { emissions, unsubscribe } = collect(store);

    // Replay on subscribe.
    await tick();
    expect(emissions).toEqual([[]]);

    store.setMuted('alpha', true);
    await tick();
    expect(emissions[emissions.length - 1]).toEqual(['alpha']);
    const emitCount = emissions.length;

    // A no-op set must not churn subscribers.
    store.setMuted('alpha', true);
    await tick();
    expect(emissions).toHaveLength(emitCount);

    unsubscribe();
    store.setMuted('beta', true);
    await tick();
    expect(emissions).toHaveLength(emitCount);
  });

  it('reloads and notifies on a cross-tab write', async () => {
    const store = MutedInstallationsStore.create();
    const { emissions } = collect(store);
    await tick();

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['gamma']));
    window.dispatchEvent(
      Object.assign(new Event('storage'), { key: STORAGE_KEY }),
    );
    await tick();

    expect(store.isMuted('gamma')).toBe(true);
    expect(emissions[emissions.length - 1]).toEqual(['gamma']);
  });
});
