import { mockApis } from '@backstage/frontend-test-utils';
import type { SignalApi } from '@backstage/plugin-signals-react';
import { ScopedStorageApi } from './scopedStorageApi';

// A file of its own: `UserSettingsStorage` keeps one instance per bucket path
// for the whole module, created with the first storage's fetch, so a bucket
// another test (in this file too) already opened answers through that
// test's fetch. Hence one test.

const BASE_URL = 'http://localhost:7007/api/user-settings';

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
  const send = (channel: string, message: object) =>
    listeners.get(channel)?.forEach(listener => listener(message));
  return { signalApi, send };
}

/** The backend's answer to a multiget of one key. */
function multigetAnswer(value: unknown) {
  return new Response(JSON.stringify({ items: [{ value }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ScopedStorageApi with the signals API', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('reads a key again when the backend announces another tab changed it', async () => {
    const { signalApi, send } = fakeSignals();
    const fetch = jest.fn<
      Promise<Response>,
      [RequestInfo | URL, RequestInit?]
    >();
    const storage = ScopedStorageApi.create({
      discoveryApi: { getBaseUrl: async () => BASE_URL },
      errorApi: { post: jest.fn(), error$: jest.fn() } as any,
      fetchApi: { fetch } as any,
      // Signed in: UserSettingsStorage talks to the backend only then.
      identityApi: mockApis.identity({ token: 'a-token' }),
      signalApi,
    });

    fetch.mockResolvedValueOnce(multigetAnswer('Muted'));
    const seen: unknown[] = [];
    const subscription = storage
      .forBucket('agent-platform')
      .observe$('someSetting')
      .subscribe(snapshot => seen.push(snapshot.value));
    await jest.advanceTimersByTimeAsync(50);
    expect(seen).toEqual(['Muted']);

    // Another tab writes; the backend announces the key on the person's
    // `user-settings` channel. Past the storage's 2 s read cache, as a write
    // a person makes in another tab is.
    await jest.advanceTimersByTimeAsync(5_000);
    fetch.mockResolvedValueOnce(multigetAnswer('All activity'));
    send('user-settings', { type: 'key-changed', key: 'someSetting' });
    await jest.advanceTimersByTimeAsync(50);

    expect(seen).toEqual(['Muted', 'All activity']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(
      `${BASE_URL}/multiget`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          items: [{ bucket: 'default.agent-platform', key: 'someSetting' }],
        }),
      }),
    );

    // An announcement for another key reads nothing.
    await jest.advanceTimersByTimeAsync(5_000);
    send('user-settings', { type: 'key-changed', key: 'unrelated' });
    await jest.advanceTimersByTimeAsync(50);
    expect(fetch).toHaveBeenCalledTimes(2);

    subscription.unsubscribe();
  });
});
