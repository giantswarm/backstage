import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * The portal's layout breakpoints: one set, so a page does not change layout
 * at five slightly different widths.
 *
 * - **Phone** (≤ {@link PHONE_MAX_WIDTH}) is the agent-platform shell's phone
 *   layout: the width at which it swaps the rail for the bottom bar. It is MUI
 *   v4's `down('xs')`, the same query core-components'
 *   `useSidebarPinState().isMobile` answers, so a component's phone branch and
 *   the shell's chrome always change together.
 * - **Two columns** (≥ {@link TWO_COLUMN_MIN_WIDTH}) is where forms and
 *   wizards go from one column to two: bui's `sm`.
 * - **Touch** is the input, not the width: no hover, a coarse pointer. A
 *   hover-revealed control is always visible under it, and a hint opens on a
 *   press.
 *
 * Viewport media are for page chrome. A component that lives in slots of
 * varying width (a table in a side panel, a list in a card) keeps measuring
 * its container instead — `useContainerDimensions` or a CSS container query.
 *
 * The agent-platform shell's stylesheet repeats {@link PHONE_MAX_WIDTH} as a
 * literal (CSS cannot import it); the app's theme test keeps the two equal.
 */

/** The widest viewport, in px, that gets the phone layout. */
export const PHONE_MAX_WIDTH = 599.95;
/** The phone layout as a `matchMedia` query. */
export const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`;
/** The phone layout as a JSS/CSS media rule key: `{ [PHONE_MEDIA]: {...} }`. */
export const PHONE_MEDIA = `@media ${PHONE_QUERY}`;

/** The narrowest viewport, in px, that lays forms and wizards out in two columns. */
export const TWO_COLUMN_MIN_WIDTH = 768;
/** The two-column layout as a `matchMedia` query. */
export const TWO_COLUMN_QUERY = `(min-width: ${TWO_COLUMN_MIN_WIDTH}px)`;
/** The two-column layout as a JSS/CSS media rule key. */
export const TWO_COLUMN_MEDIA = `@media ${TWO_COLUMN_QUERY}`;

/** A touch-first device — no hover, a coarse pointer — as a `matchMedia` query. */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';
/** Touch input as a JSS/CSS media rule key. */
export const TOUCH_MEDIA = `@media ${TOUCH_QUERY}`;

function canMatchMedia(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  );
}

/**
 * Whether a media query matches, live: the component re-renders when the
 * answer changes (a window resized across the breakpoint, a tablet rotated).
 * `false` where there is no `matchMedia` — server rendering, or a test
 * environment that did not mock it (see `mockPhoneLayout`).
 */
export function useMediaQueryMatch(query: string): boolean {
  const list = useMemo(
    () => (canMatchMedia() ? window.matchMedia(query) : undefined),
    [query],
  );
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!list) {
        return () => {};
      }
      // Safari before 14 knows only the deprecated listener API.
      if (typeof list.addEventListener === 'function') {
        list.addEventListener('change', onChange);
        return () => list.removeEventListener('change', onChange);
      }
      list.addListener(onChange);
      return () => list.removeListener(onChange);
    },
    [list],
  );
  const getSnapshot = useCallback(() => list?.matches ?? false, [list]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Whether the viewport has the phone layout (≤ {@link PHONE_MAX_WIDTH}): the
 * one switch for a component's phone branch — stacked rows instead of a table,
 * a menu instead of a row of buttons. Live, and `false` without `matchMedia`.
 */
export function usePhoneLayout(): boolean {
  return useMediaQueryMatch(PHONE_QUERY);
}

/**
 * Whether the device is touch-first ({@link TOUCH_QUERY}): there is no hover
 * to reveal anything and no Shift key on the keyboard. A narrow desktop
 * window is a phone layout but not touch input; a tablet is the reverse.
 */
export function useTouchInput(): boolean {
  return useMediaQueryMatch(TOUCH_QUERY);
}
