import { ExternalUrlConsentManager } from './ExternalUrlConsentManager';

describe('ExternalUrlConsentManager', () => {
  it('opens nothing until the person accepts, then opens the serialized address', async () => {
    const openUrl = jest.fn();
    const manager = new ExternalUrlConsentManager(openUrl);

    const answered = manager.open({
      url: 'https://аpple.com/x',
      requester: 'miro',
    });
    expect(openUrl).not.toHaveBeenCalled();

    manager.answer(manager.current()!.id, 'accept');

    await expect(answered).resolves.toBe('accept');
    expect(openUrl).toHaveBeenCalledWith('https://xn--pple-43d.com/x', 'tab');
    expect(manager.current()).toBeUndefined();
  });

  it.each(['decline', 'cancel'] as const)(
    'opens nothing on %s',
    async answer => {
      const openUrl = jest.fn();
      const manager = new ExternalUrlConsentManager(openUrl);
      const answered = manager.open({
        url: 'https://example.com',
        requester: 'miro',
        target: 'page',
      });

      manager.answer(manager.current()!.id, answer);

      await expect(answered).resolves.toBe(answer);
      expect(openUrl).not.toHaveBeenCalled();
    },
  );

  it('never opens an address that is no web page, even on accept', async () => {
    const openUrl = jest.fn();
    const manager = new ExternalUrlConsentManager(openUrl);
    const answered = manager.open({
      // eslint-disable-next-line no-script-url
      url: 'javascript:alert(1)',
      requester: 'miro',
    });

    manager.answer(manager.current()!.id, 'accept');

    await expect(answered).resolves.toBe('cancel');
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('asks once for an address already waiting, then the next in order', async () => {
    const manager = new ExternalUrlConsentManager(jest.fn());
    const listener = jest.fn();
    manager.subscribe(listener);

    const first = manager.open({ url: 'https://a.example', requester: 'a' });
    const again = manager.open({ url: 'https://a.example', requester: 'a' });
    manager.open({ url: 'https://b.example', requester: 'b' });

    expect(listener).toHaveBeenCalledTimes(2);
    manager.answer(manager.current()!.id, 'decline');
    await expect(first).resolves.toBe('decline');
    await expect(again).resolves.toBe('decline');
    expect(manager.current()?.url).toBe('https://b.example');
  });
});
