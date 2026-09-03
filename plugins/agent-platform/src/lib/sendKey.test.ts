import type { KeyboardEvent } from 'react';
import { isSendKey } from './sendKey';

function key(overrides: Partial<KeyboardEvent> & { isComposing?: boolean }) {
  const { isComposing = false, ...rest } = overrides;
  return {
    key: 'Enter',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    nativeEvent: { isComposing },
    ...rest,
  } as unknown as KeyboardEvent;
}

describe('isSendKey', () => {
  it('is Enter', () => {
    expect(isSendKey(key({}))).toBe(true);
  });

  it('is still Cmd/Ctrl+Enter, the key it used to be', () => {
    expect(isSendKey(key({ ctrlKey: true }))).toBe(true);
    expect(isSendKey(key({ metaKey: true }))).toBe(true);
  });

  it('is not Shift+Enter, which breaks the line', () => {
    expect(isSendKey(key({ shiftKey: true }))).toBe(false);
  });

  it('is not an Enter that commits an IME composition', () => {
    expect(isSendKey(key({ isComposing: true }))).toBe(false);
  });

  it('is no other key', () => {
    expect(isSendKey(key({ key: 'a' }))).toBe(false);
    expect(isSendKey(key({ key: ' ' }))).toBe(false);
  });
});
