import { mockApis } from '@backstage/frontend-test-utils';
import { ScopedStorageApi } from './scopedStorageApi';

const BASE_URL = 'http://localhost:7007/api/user-settings';

function makeStorage() {
  // The backend answers a PUT with the stored value.
  const fetch = jest.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(init?.body ?? null, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  const storage = ScopedStorageApi.create({
    discoveryApi: { getBaseUrl: async () => BASE_URL },
    errorApi: { post: jest.fn(), error$: jest.fn() } as any,
    fetchApi: { fetch } as any,
    // Signed in: UserSettingsStorage talks to the backend only then.
    identityApi: mockApis.identity({ token: 'a-token' }),
  });
  return { storage, fetch };
}

describe('ScopedStorageApi', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the agent platform’s bucket in the user-settings backend', async () => {
    const { storage, fetch } = makeStorage();

    await storage
      .forBucket('agent-platform')
      .set('pinnedSessions', ['inst-1/s1']);

    // UserSettingsStorage's default namespace, as when it backed the whole
    // app: what the agent platform already stored there stays readable.
    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/buckets/default.agent-platform/keys/pinnedSessions`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ value: ['inst-1/s1'] }),
      }),
    );
    expect(localStorage.length).toBe(0);
  });

  it('keeps every other bucket in localStorage, as the upstream default', async () => {
    const { storage, fetch } = makeStorage();
    const starred = storage.forBucket('starredEntities');

    await starred.set('entityRefs', ['component:default/portal']);

    expect(fetch).not.toHaveBeenCalled();
    expect(
      JSON.parse(localStorage.getItem('/starredEntities/entityRefs')!),
    ).toEqual(['component:default/portal']);
    expect(starred.snapshot('entityRefs')).toMatchObject({
      presence: 'present',
      value: ['component:default/portal'],
    });
  });

  it('reads data a classic bucket already holds in localStorage, unmigrated', () => {
    localStorage.setItem(
      '/home.visits/visits',
      JSON.stringify([{ pathname: '/catalog' }]),
    );
    const { storage, fetch } = makeStorage();

    expect(storage.forBucket('home.visits').snapshot('visits')).toMatchObject({
      presence: 'present',
      value: [{ pathname: '/catalog' }],
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps top-level keys in localStorage', async () => {
    const { storage, fetch } = makeStorage();

    await storage.set('theme', 'light');
    expect(storage.snapshot('theme')).toMatchObject({ value: 'light' });
    await storage.remove('theme');
    expect(storage.snapshot('theme')).toMatchObject({ presence: 'absent' });

    expect(fetch).not.toHaveBeenCalled();
  });
});
