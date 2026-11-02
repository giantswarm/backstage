import type { KeyboardEvent } from 'react';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import {
  isSendKey,
  isTouchInput,
  sendEnterKeyHint,
  sendKeyCaption,
} from './sendKey';

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

let layout: MockedLayout | undefined;

afterEach(() => {
  layout?.restore();
  layout = undefined;
});

describe('isSendKey', () => {
  describe('with a keyboard and a mouse', () => {
    beforeEach(() => {
      layout = mockDesktopLayout();
    });

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

    it('keeps the desktop rule in a narrow window, which is not touch input', () => {
      layout?.restore();
      layout = mockPhoneLayout({ touch: false });

      expect(isSendKey(key({}))).toBe(true);
    });
  });

  describe('on touch input', () => {
    beforeEach(() => {
      layout = mockPhoneLayout();
    });

    // A soft keyboard has no Shift: Enter is the only way to a second line.
    it('is not Enter, which breaks the line; the Send button sends', () => {
      expect(isSendKey(key({}))).toBe(false);
    });

    it('is still Cmd/Ctrl+Enter, for a tablet with a hardware keyboard', () => {
      expect(isSendKey(key({ ctrlKey: true }))).toBe(true);
      expect(isSendKey(key({ metaKey: true }))).toBe(true);
    });

    it('is not Shift+Enter or an IME commit either', () => {
      expect(isSendKey(key({ shiftKey: true }))).toBe(false);
      expect(isSendKey(key({ metaKey: true, isComposing: true }))).toBe(false);
    });

    it('answers for the input at the moment of the key press', () => {
      expect(isSendKey(key({}))).toBe(false);
      layout?.setTouch(false);
      expect(isSendKey(key({}))).toBe(true);
    });
  });

  it('keeps the desktop rule where there is no matchMedia', () => {
    expect(window.matchMedia).toBeUndefined();
    expect(isTouchInput()).toBe(false);
    expect(isSendKey(key({}))).toBe(true);
  });

  it('takes the input from the caller when it knows it', () => {
    expect(isSendKey(key({}), true)).toBe(false);
    expect(isSendKey(key({}), false)).toBe(true);
  });
});

describe('sendEnterKeyHint', () => {
  it('labels the soft keyboard’s Enter as a line break on touch, send elsewhere', () => {
    layout = mockPhoneLayout();
    expect(sendEnterKeyHint()).toBe('enter');
    layout.setTouch(false);
    expect(sendEnterKeyHint()).toBe('send');
  });
});

describe('sendKeyCaption', () => {
  it('names Enter and Shift+Enter with a keyboard', () => {
    layout = mockDesktopLayout();
    expect(sendKeyCaption()).toBe('Enter sends, Shift+Enter for a new line.');
    expect(
      sendKeyCaption({
        key: 'Enter starts a session',
        tap: 'Tap Send to start a session',
      }),
    ).toBe('Enter starts a session, Shift+Enter for a new line.');
  });

  it('names the Send button on touch, and promises no Shift+Enter', () => {
    layout = mockPhoneLayout();
    expect(sendKeyCaption()).toBe('Tap Send to send.');
    expect(
      sendKeyCaption({
        key: 'Enter starts a session',
        tap: 'Tap Send to start a session',
      }),
    ).toBe('Tap Send to start a session.');
  });
});
