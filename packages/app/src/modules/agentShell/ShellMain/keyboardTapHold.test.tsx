import { fireEvent, render } from '@testing-library/react';
import {
  KEYBOARD_TAP_HOLD_ATTRIBUTE,
  useKeyboardTapHold,
} from './keyboardTapHold';

function Harness() {
  useKeyboardTapHold();
  return (
    <>
      <textarea aria-label="Message" />
      <input aria-label="Read only" readOnly />
      <input type="checkbox" aria-label="Agree" />
      <button type="button">Continue</button>
    </>
  );
}

const held = () =>
  document.documentElement.hasAttribute(KEYBOARD_TAP_HOLD_ATTRIBUTE);

describe('useKeyboardTapHold', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    document.documentElement.removeAttribute(KEYBOARD_TAP_HOLD_ATTRIBUTE);
  });

  it('holds the keyboard layout from the pointer down outside a focused text field until the click has run', () => {
    const { getByRole } = render(<Harness />);
    getByRole('textbox', { name: 'Message' }).focus();
    const button = getByRole('button', { name: 'Continue' });

    fireEvent.pointerDown(button);
    expect(held()).toBe(true);
    fireEvent.pointerUp(button);
    expect(held()).toBe(true);
    fireEvent.click(button);
    // The target's own handler runs first; the hold lets go right after.
    expect(held()).toBe(true);
    jest.advanceTimersByTime(0);
    expect(held()).toBe(false);
  });

  it('lets go after the finger lifts when no click follows, and after a second at most', () => {
    const { getByRole } = render(<Harness />);
    getByRole('textbox', { name: 'Message' }).focus();
    const button = getByRole('button', { name: 'Continue' });

    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    jest.advanceTimersByTime(400);
    expect(held()).toBe(false);

    fireEvent.pointerDown(button);
    expect(held()).toBe(true);
    jest.advanceTimersByTime(1000);
    expect(held()).toBe(false);
  });

  it('does not hold for a tap inside the focused field, or when no text field has focus', () => {
    const { getByRole } = render(<Harness />);
    const field = getByRole('textbox', { name: 'Message' });
    const button = getByRole('button', { name: 'Continue' });

    field.focus();
    fireEvent.pointerDown(field);
    expect(held()).toBe(false);

    getByRole('checkbox', { name: 'Agree' }).focus();
    fireEvent.pointerDown(button);
    expect(held()).toBe(false);

    getByRole('textbox', { name: 'Read only' }).focus();
    fireEvent.pointerDown(button);
    expect(held()).toBe(false);
  });

  it('lets go when it unmounts', () => {
    const { getByRole, unmount } = render(<Harness />);
    getByRole('textbox', { name: 'Message' }).focus();
    fireEvent.pointerDown(getByRole('button', { name: 'Continue' }));
    expect(held()).toBe(true);
    unmount();
    expect(held()).toBe(false);
  });
});
