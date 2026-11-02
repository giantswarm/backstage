import { type CookieLocks, ProviderCookieQueue } from './providerCookieQueue';

/** Web Locks as the browser grants them: one holder per name at a time. */
function fakeLocks() {
  const held = new Map<string, Promise<unknown>>();
  const names: string[] = [];
  const locks: CookieLocks = {
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      names.push(name);
      const previous = held.get(name) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(callback);
      held.set(name, next);
      return next;
    },
  };
  return { locks, names };
}

describe('ProviderCookieQueue', () => {
  it('takes the provider’s lock for every cookie request, so other tabs wait too', async () => {
    const { locks, names } = fakeLocks();
    const queue = new ProviderCookieQueue(locks);

    await Promise.all([
      queue.refresh('oidc-gazelle', new Set(['openid']), async () => 'a'),
      queue.refresh('oidc-gazelle', new Set(['email']), async () => 'b'),
      queue.endSession('oidc-gazelle', async () => 'c'),
    ]).catch(() => undefined);

    expect(names).toEqual([
      'backstage-auth-cookie:oidc-gazelle',
      'backstage-auth-cookie:oidc-gazelle',
      'backstage-auth-cookie:oidc-gazelle',
    ]);
  });

  it('keeps providers apart', async () => {
    const queue = new ProviderCookieQueue(undefined);
    const order: string[] = [];
    let release!: () => void;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });

    const gazelle = queue.refresh('oidc-gazelle', undefined, async () => {
      await held;
      order.push('gazelle');
    });
    await queue.refresh('oidc-golem', undefined, async () => {
      order.push('golem');
    });
    release();
    await gazelle;

    expect(order).toEqual(['golem', 'gazelle']);
  });

  it('lets a refresh of the backend’s default scopes join only another of them', async () => {
    const queue = new ProviderCookieQueue(undefined);
    const send = jest.fn(async () => 'session');

    await Promise.all([
      queue.refresh('oidc-gazelle', undefined, send),
      queue.refresh('oidc-gazelle', undefined, send),
      queue.refresh('oidc-gazelle', new Set(['openid']), send),
    ]);

    expect(send).toHaveBeenCalledTimes(2);
  });
});
