import { WebStorage } from '@backstage/core-app-api';
import { mockApis } from '@backstage/frontend-test-utils';
import type { StorageValueSnapshot } from '@backstage/core-plugin-api';
import type { SignalApi } from '@backstage/plugin-signals-react';
import type { JsonValue } from '@backstage/types';
import { RoamingSettingsStorage } from './RoamingSettingsStorage';

const BASE_URL = 'http://localhost:7007/api/user-settings';
const KEY_URL = `${BASE_URL}/buckets/default.agent-platform/keys/someSetting`;

/** A signals API whose messages the test sends itself. */
function fakeSignals() {
  const listeners = new Map<string, Set<(message: any) => void>>();
  const signalApi: SignalApi = {
    subscribe: (channel, onMessage) => {
      const set = listeners.get(channel) ?? new Set();
      set.add(onMessage);
      listeners.set(channel, set);
      return { unsubscribe: () => set.delete(onMessage) };
    },
  };
  const send = (message: object) =>
    listeners.get('user-settings')?.forEach(listener => listener(message));
  const count = () => listeners.get('user-settings')?.size ?? 0;
  return { signalApi, send, count };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setup({ signedIn = true }: { signedIn?: boolean } = {}) {
  const signals = fakeSignals();
  const fetch = jest.fn<Promise<Response>, [string, RequestInit?]>();
  const fallback = WebStorage.create({
    errorApi: { post: jest.fn(), error$: jest.fn() } as any,
  });
  const storage = RoamingSettingsStorage.create({
    discoveryApi: { getBaseUrl: async () => BASE_URL },
    fetchApi: { fetch } as any,
    identityApi: mockApis.identity(signedIn ? { token: 'a-token' } : {}),
    fallback,
    signalApi: signals.signalApi,
  }).forBucket('agent-platform');
  return { storage, fetch, fallback, ...signals };
}

/** Subscribes to the key and collects what it hands out. */
function watch(storage: ReturnType<typeof setup>['storage']) {
  const seen: StorageValueSnapshot<JsonValue>[] = [];
  const subscription = storage
    .observe$('someSetting')
    .subscribe(snapshot => seen.push(snapshot));
  return { seen, subscription };
}

/** Lets pending promise chains settle. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('RoamingSettingsStorage', () => {
  beforeEach(() => localStorage.clear());

  it('reads the stored value from the user-settings backend', async () => {
    const { storage, fetch } = setup();
    fetch.mockResolvedValueOnce(json({ value: ['inst-1/s1'] }));

    const { seen } = watch(storage);
    await settle();

    expect(fetch).toHaveBeenCalledWith(KEY_URL);
    expect(seen).toEqual([
      { key: 'someSetting', presence: 'present', value: ['inst-1/s1'] },
    ]);
  });

  it('reads a key the backend does not hold as absent', async () => {
    const { storage, fetch } = setup();
    fetch.mockResolvedValueOnce(json({ error: 'not found' }, 404));

    const { seen } = watch(storage);
    await settle();

    expect(seen).toEqual([{ key: 'someSetting', presence: 'absent' }]);
  });

  it.each`
    failure               | answer
    ${'a server error'}   | ${() => Promise.resolve(json({}, 503))}
    ${'a network error'}  | ${() => Promise.reject(new TypeError('Failed to fetch'))}
    ${'a non-JSON reply'} | ${() => Promise.resolve(new Response('<html>'))}
  `('reads $failure as unknown, never as absent', async ({ answer }) => {
    const { storage, fetch } = setup();
    fetch.mockImplementationOnce(answer);

    const { seen } = watch(storage);
    await settle();

    expect(seen).toEqual([{ key: 'someSetting', presence: 'unknown' }]);
  });

  it('reads the key afresh when another tab’s change is announced, right after a read', async () => {
    const { storage, fetch, send } = setup();
    fetch.mockResolvedValueOnce(json({ value: 'Muted' }));
    const { seen } = watch(storage);
    await settle();

    // No read cache: the announcement right after the read reads again.
    fetch.mockResolvedValueOnce(json({ value: 'All activity' }));
    send({ type: 'key-changed', key: 'someSetting' });
    await settle();

    expect(seen.map(snapshot => snapshot.value)).toEqual([
      'Muted',
      'All activity',
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);

    send({ type: 'key-changed', key: 'unrelated' });
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('drops an answer overtaken by a newer one', async () => {
    const { storage, fetch, send } = setup();
    let answerFirst: (response: Response) => void = () => {};
    fetch.mockImplementationOnce(
      () => new Promise(resolve => (answerFirst = resolve)),
    );
    const { seen } = watch(storage);
    fetch.mockResolvedValueOnce(json({ value: 'newer' }));
    send({ type: 'key-changed', key: 'someSetting' });
    await settle();

    answerFirst(json({ value: 'older' }));
    await settle();

    expect(seen.map(snapshot => snapshot.value)).toEqual(['newer']);
  });

  it('stores a value and hands it to every subscriber', async () => {
    const { storage, fetch } = setup();
    fetch.mockResolvedValue(json({ value: 'before' }));
    const first = watch(storage);
    const second = watch(storage);
    await settle();

    fetch.mockImplementationOnce(async (_url, init) =>
      json({ value: JSON.parse(String(init?.body)).value }),
    );
    await storage.set('someSetting', 'after');

    expect(fetch).toHaveBeenLastCalledWith(
      KEY_URL,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ value: 'after' }),
      }),
    );
    expect(first.seen.at(-1)).toEqual({
      key: 'someSetting',
      presence: 'present',
      value: 'after',
    });
    expect(second.seen.at(-1)?.value).toBe('after');
  });

  it('rejects a write the backend does not take, and hands nothing out', async () => {
    const { storage, fetch } = setup();
    fetch.mockResolvedValueOnce(json({ value: 'before' }));
    const { seen } = watch(storage);
    await settle();
    fetch.mockResolvedValueOnce(json({}, 413));

    await expect(storage.set('someSetting', 'too big')).rejects.toThrow(
      'answered 413',
    );
    expect(seen.map(snapshot => snapshot.value)).toEqual(['before']);
  });

  it('keeps values in browser storage while the person is not signed in', async () => {
    const { storage, fetch, fallback } = setup({ signedIn: false });

    await storage.set('someSetting', ['local']);
    const { seen } = watch(storage);
    await settle();

    expect(fetch).not.toHaveBeenCalled();
    expect(
      fallback.forBucket('agent-platform').snapshot('someSetting').value,
    ).toEqual(['local']);
    expect(seen).toEqual([
      { key: 'someSetting', presence: 'present', value: ['local'] },
    ]);
  });

  it('listens for announcements only while the key is watched', async () => {
    const { storage, fetch, count } = setup();
    fetch.mockResolvedValue(json({ value: 1 }));

    const { subscription } = watch(storage);
    expect(count()).toBe(1);
    subscription.unsubscribe();

    expect(count()).toBe(0);
  });
});
