import { useEffect } from 'react';

/**
 * Set on `<html>` while a tap that started outside the focused text field is
 * in progress; agent-shell.css keeps the phone's keyboard layout (bottom bar
 * aside, docked footers and the composer dropped) for as long as it is there.
 */
export const KEYBOARD_TAP_HOLD_ATTRIBUTE = 'data-agent-shell-keyboard-hold';

/** The fields that raise a soft keyboard — agent-shell.css's list. */
const TEXT_FIELD = [
  'textarea',
  "[contenteditable='true']",
  "[contenteditable='']",
  "input:not([type='button']):not([type='checkbox']):not([type='color']):not([type='file']):not([type='hidden']):not([type='image']):not([type='radio']):not([type='range']):not([type='reset']):not([type='submit'])",
].join(', ');

/** How long a tap may take before the hold lets go on its own, ms. */
const HOLD_LIMIT_MS = 1000;
/** After the finger lifts: long enough for the click that follows it. */
const AFTER_POINTER_UP_MS = 400;

function isTextField(element: Element | null): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.matches(TEXT_FIELD) &&
    !element.hasAttribute('readonly')
  );
}

/**
 * Keeps a tap on its target while the soft keyboard goes away (T22 wave 4).
 *
 * On a touch phone, while a text field has focus, the bottom bar steps aside
 * and everything docked above it — the wizard footer, the session composer —
 * drops by the bar's height (agent-shell.css). A tap on one of those buttons
 * blurs the field at the pointer's down, the layout snaps back 56px up before
 * the pointer lifts, and the press ends off its target: the first tap on
 * Continue or Send did nothing. While such a tap is in progress the keyboard
 * layout holds; it lets go once the click has run (or the tap was cancelled,
 * or after a second at most).
 */
export function useKeyboardTapHold(): void {
  useEffect(() => {
    const root = document.documentElement;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const release = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      root.removeAttribute(KEYBOARD_TAP_HOLD_ATTRIBUTE);
    };
    const releaseAfter = (ms: number) => {
      if (!root.hasAttribute(KEYBOARD_TAP_HOLD_ATTRIBUTE)) {
        return;
      }
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(release, ms);
    };

    const onPointerDown = (event: PointerEvent) => {
      const field = document.activeElement;
      if (
        !isTextField(field) ||
        (event.target instanceof Node && field.contains(event.target))
      ) {
        return;
      }
      root.setAttribute(KEYBOARD_TAP_HOLD_ATTRIBUTE, '');
      releaseAfter(HOLD_LIMIT_MS);
    };
    const onPointerUp = () => releaseAfter(AFTER_POINTER_UP_MS);
    // Capture runs before the target's own handler; the release waits for it.
    const onClick = () => releaseAfter(0);

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onClick, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onClick, true);
      document.removeEventListener('click', onClick, true);
      release();
    };
  }, []);
}
