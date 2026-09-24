import { RefObject, useEffect, useLayoutEffect } from 'react';

function resize(
  container: HTMLElement | null,
  { minRows, maxRows }: { minRows: number; maxRows: number },
) {
  const textarea = container?.querySelector('textarea');
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
}

/**
 * Grows the first `<textarea>` inside `containerRef` with its content, between
 * `minRows` and `maxRows` lines, and scrolls it beyond that.
 *
 * Resizes on typing, and after every render so a value set from outside
 * (cleared on send, restored after a failure) resizes the box too.
 */
export function useAutosizeTextarea(
  containerRef: RefObject<HTMLElement>,
  { minRows, maxRows }: { minRows: number; maxRows: number },
) {
  useLayoutEffect(() => {
    resize(containerRef.current, { minRows, maxRows });
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }
    const onInput = () => resize(container, { minRows, maxRows });
    container.addEventListener('input', onInput);
    return () => container.removeEventListener('input', onInput);
  }, [containerRef, minRows, maxRows]);
}
