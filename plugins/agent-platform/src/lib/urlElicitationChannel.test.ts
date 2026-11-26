import {
  announceElicitationReturn,
  listenForElicitationReturn,
  URL_ELICITATION_CHANNEL,
  URL_ELICITATION_STORAGE_KEY,
} from './urlElicitationChannel';

class FakeChannel {
  static open: FakeChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(readonly name: string) {
    FakeChannel.open.push(this);
  }
  postMessage(data: unknown) {
    FakeChannel.open
      .filter(other => other !== this && other.name === this.name)
      .forEach(other => other.onmessage?.({ data } as MessageEvent));
  }
  close() {
    FakeChannel.open = FakeChannel.open.filter(entry => entry !== this);
  }
}

const message = { elicitationId: 'el-1', nonce: 'n-1' };

describe('urlElicitationChannel', () => {
  afterEach(() => {
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    FakeChannel.open = [];
  });

  it('delivers over BroadcastChannel', () => {
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel =
      FakeChannel;
    const heard = jest.fn();
    const stop = listenForElicitationReturn(heard);
    announceElicitationReturn(message);
    expect(heard).toHaveBeenCalledWith(message);
    stop();
    announceElicitationReturn(message);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(FakeChannel.open).toHaveLength(0);
    expect(URL_ELICITATION_CHANNEL).toContain('url-elicitation');
  });

  it('falls back to a storage event without BroadcastChannel, leaving nothing stored', () => {
    const heard = jest.fn();
    const stop = listenForElicitationReturn(heard);
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    announceElicitationReturn(message);
    expect(setItem).toHaveBeenCalledWith(
      URL_ELICITATION_STORAGE_KEY,
      expect.stringContaining('"nonce":"n-1"'),
    );
    expect(window.localStorage.getItem(URL_ELICITATION_STORAGE_KEY)).toBeNull();
    // The browser tells the other tabs; jsdom does not, so play it.
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: URL_ELICITATION_STORAGE_KEY,
        newValue: setItem.mock.calls[0][1],
      }),
    );
    expect(heard).toHaveBeenCalledWith(message);
    setItem.mockRestore();
    stop();
  });

  it.each([
    ['another key', 'other', JSON.stringify(message)],
    ['a removal', URL_ELICITATION_STORAGE_KEY, null],
    ['garbage', URL_ELICITATION_STORAGE_KEY, 'not json'],
    [
      'a message without a nonce',
      URL_ELICITATION_STORAGE_KEY,
      '{"elicitationId":"x"}',
    ],
  ])('ignores %s', (_, key, newValue) => {
    const heard = jest.fn();
    const stop = listenForElicitationReturn(heard);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
    expect(heard).not.toHaveBeenCalled();
    stop();
  });
});
