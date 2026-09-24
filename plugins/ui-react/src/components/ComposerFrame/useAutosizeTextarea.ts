import { RefObject, useLayoutEffect } from 'react';

/**
 * Grows the first `<textarea>` inside `containerRef` with its content, between
 * `minRows` and `maxRows` lines, and scrolls it beyond that.
 *
 * Runs after every render rather than on an input event, so a value set from
 * outside (cleared on send, restored after a failure) resizes the box too.
 */
export function useAutosizeTextarea(
  containerRef: RefObject<HTMLElement>,
  { minRows, maxRows }: { minRows: number; maxRows: number },
) {
  useLayoutEffect(() => {
    const textarea = containerRef.current?.querySelector('textarea');
    if (!textarea) {
      return;
    }

    const style = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight);
    if (Number.isNaN(lineHeight)) {
      return;
    }
    const paddingY =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const min = minRows * lineHeight + paddingY;
    const max = maxRows * lineHeight + paddingY;

    textarea.style.height = 'auto';
    const height = Math.min(Math.max(textarea.scrollHeight, min), max);
    textarea.style.height = `${height}px`;
    textarea.style.overflowY = textarea.scrollHeight > max ? 'auto' : 'hidden';
  });
}
