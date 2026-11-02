import { useLayoutEffect } from 'react';

/** CSS variable: page height the conversation column does not get (px). */
export const COLUMN_RESERVE_VAR = '--session-column-reserve';
/** CSS variable: the docked composer's current height (px). */
export const DOCK_HEIGHT_VAR = '--session-dock-height';

function px(value: string): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Whether `element`'s children are laid out side by side. */
function isRow(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return (
    (style.display === 'flex' || style.display === 'inline-flex') &&
    !style.flexDirection.startsWith('column')
  );
}

/**
 * How much of the document is not `column`: everything above it, plus the
 * padding, borders and in-flow siblings that follow it up to `<html>`.
 *
 * Structural rather than "the document's height minus the column's bottom",
 * because a document shorter than the viewport reports the viewport's height
 * — which is exactly the case this is for — and that reading would size the
 * column to whatever it already was.
 */
function measureReserve(column: HTMLElement): number {
  const top = column.getBoundingClientRect().top + window.scrollY;
  let below = 0;
  let node: HTMLElement | null = column;
  while (node && node !== document.documentElement) {
    const parent: HTMLElement | null = node.parentElement;
    if (node !== column) {
      const style = getComputedStyle(node);
      below += px(style.paddingBottom) + px(style.borderBottomWidth);
    }
    if (parent && !isRow(parent)) {
      for (
        let sibling = node.nextElementSibling;
        sibling;
        sibling = sibling.nextElementSibling
      ) {
        if (!(sibling instanceof HTMLElement)) continue;
        const position = getComputedStyle(sibling).position;
        if (position === 'fixed' || position === 'absolute') continue;
        below += sibling.offsetHeight;
      }
    }
    node = parent;
  }
  return Math.max(0, Math.ceil(top + below));
}

/**
 * Keeps the session's composer docked at the foot of the view (T40).
 *
 * The dock itself is `position: sticky` at the column's end, so a long
 * conversation scrolls behind it and its last message is never under it — the
 * dock takes its own room in the flow. What CSS alone cannot do is put it at
 * the bottom of the view while the conversation is still *short*: the column
 * is content-sized, and the chrome above and below it varies (the shell's page
 * header, which wraps at phone width; classic chrome's; the shell's mobile
 * bottom bar). So this measures that chrome and publishes it on the column as
 * {@link COLUMN_RESERVE_VAR}, for a `min-height: calc(100dvh - reserve)` — the
 * same "fill the view, less the chrome" rule as WizardFrame's (T36), with the
 * chrome measured rather than assumed. The dock then sits at the bottom from
 * the first message on, and new messages fill the space above it instead of
 * pushing it down.
 *
 * It also publishes the dock's own height as {@link DOCK_HEIGHT_VAR}, so a
 * control in the conversation that the browser scrolls into view (a focused
 * fold-out, a tab stop) can keep a scroll margin clear of it — the dock grows
 * while a question card is attached.
 *
 * The same height goes on the document root while the dock is there (T22 B4),
 * for what floats over the page from outside the column: the shell's
 * stylesheet lifts the toasts (`[class*='Toast_container']`) by it, so a
 * "waiting for you" toast lands above the docked composer instead of on it.
 * It is the dock's own height, not counting the shell's bottom bar under it
 * (the stylesheet adds that), and it is removed when the dock goes, so a page
 * without one puts the toasts back at the bar.
 *
 * Takes the elements rather than refs (the page holds them through callback
 * refs), so it re-runs exactly when the column or the dock mounts or goes —
 * both exist only on some of the page's paths. Without `ResizeObserver`
 * (tests) it measures once; nothing depends on the variables beyond layout.
 */
export function useDockedComposerLayout(
  columnElement: HTMLElement | null,
  dockElement: HTMLElement | null,
): void {
  useLayoutEffect(() => {
    if (!columnElement) {
      return undefined;
    }
    let frame = 0;
    const root = document.documentElement;
    const measure = () => {
      frame = 0;
      columnElement.style.setProperty(
        COLUMN_RESERVE_VAR,
        `${measureReserve(columnElement)}px`,
      );
      const dockHeight = `${
        dockElement ? Math.ceil(dockElement.offsetHeight) : 0
      }px`;
      columnElement.style.setProperty(DOCK_HEIGHT_VAR, dockHeight);
      if (dockElement) {
        root.style.setProperty(DOCK_HEIGHT_VAR, dockHeight);
      } else {
        root.style.removeProperty(DOCK_HEIGHT_VAR);
      }
    };
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(measure);
      }
    };
    measure();
    window.addEventListener('resize', schedule);
    // The body resizes whenever anything around the column does — the header
    // wrapping, a notice appearing — and the dock when a card attaches.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(schedule);
    observer?.observe(document.body);
    if (dockElement) {
      observer?.observe(dockElement);
    }
    return () => {
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      if (frame) {
        cancelAnimationFrame(frame);
      }
      // The dock is going (or being swapped for another element, which the
      // next run measures): nothing is docked until then.
      root.style.removeProperty(DOCK_HEIGHT_VAR);
    };
  }, [columnElement, dockElement]);
}
