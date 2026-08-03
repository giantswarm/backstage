import { SyntheticEvent } from 'react';

/**
 * Keep a press on a link inside a table row from also reaching the row.
 *
 * Our tables give a row both an anchor in its row-header cell and a whole-row
 * `onClick`. The row's `onClick` is react-aria's `onAction`, which fires for a
 * press anywhere inside the row — the anchor included, since `usePress` has no
 * exemption for interactive descendants. Without this, a single click on the
 * link navigates *twice*: once through the anchor, once through the row. On a
 * plain click that pushes the same path onto the history stack twice, so Back
 * needs two presses to return to the list; with cmd held it is worse, because
 * react-router leaves a modified event to the browser — the target opens in a
 * new tab *and* the current tab navigates away, defeating the reason the anchor
 * exists.
 *
 * `usePress` works off pointer events rather than `click`, so `pointerdown` and
 * `pointerup` are the ones that have to be stopped; `click` is stopped too, for
 * the synthetic-click path. Stopping propagation does not set
 * `defaultPrevented`, so the anchor's own react-router navigation still happens.
 *
 * Attach to the anchor as
 * `onPointerDown={stopRowPress} onPointerUp={stopRowPress} onClick={stopRowPress}`.
 */
export function stopRowPress(event: SyntheticEvent) {
  event.stopPropagation();
}
