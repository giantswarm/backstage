import {
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';

export interface AutosizeTextareaOptions {
  /** Lines shown when empty; also set as the textarea's `rows`. */
  minRows: number;
  /** Lines it grows to before it scrolls. */
  maxRows: number;
}

// What decides the height of wrapped text, copied onto the measuring copy.
const MIRRORED_STYLES = [
  'boxSizing',
  'width',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'textTransform',
  'textIndent',
  'tabSize',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',
] as const;

function createMirror(): HTMLTextAreaElement {
  const mirror = document.createElement('textarea');
  mirror.setAttribute('aria-hidden', 'true');
  mirror.tabIndex = -1;
  mirror.readOnly = true;
  Object.assign(mirror.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    overflow: 'hidden',
    height: '0',
    minHeight: '0',
  });
  document.body.appendChild(mirror);
  return mirror;
}

/**
 * Grows the first `<textarea>` inside `containerRef` with its content, between
 * `minRows` and `maxRows` lines, and scrolls it beyond that.
 *
 * Measures a hidden copy rather than the field itself: collapsing the field to
 * read its `scrollHeight` shortens the document for a moment, and the browser
 * clamps the page's scroll position and does not give it back.
 *
 * Re-measures when the value changes (typing, or a value set from outside) and
 * when the field's width changes, since that rewraps the text.
 */
export function useAutosizeTextarea(
  containerRef: RefObject<HTMLElement>,
  { minRows, maxRows }: AutosizeTextareaOptions,
) {
  const mirrorRef = useRef<HTMLTextAreaElement | null>(null);
  const widthRef = useRef<number | undefined>(undefined);
  const measuredRef = useRef('');

  const resize = useCallback(() => {
    const textarea = containerRef.current?.querySelector('textarea');
    if (!textarea) {
      return;
    }
    textarea.rows = minRows;

    const key = [textarea.value, widthRef.current, minRows, maxRows].join(
      '\u0000',
    );
    if (key === measuredRef.current) {
      return;
    }
    measuredRef.current = key;

    const style = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight);
    if (Number.isNaN(lineHeight)) {
      return;
    }

    mirrorRef.current ??= createMirror();
    const mirror = mirrorRef.current;
    for (const property of MIRRORED_STYLES) {
      mirror.style[property] = style[property];
    }
    mirror.value = textarea.value;

    // The copy is 0px tall, so its scrollHeight is the text plus its padding.
    const paddingY =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const content = mirror.scrollHeight - paddingY;
    const clamped = Math.min(
      Math.max(content, minRows * lineHeight),
      maxRows * lineHeight,
    );
    const outside =
      style.boxSizing === 'border-box'
        ? paddingY +
          parseFloat(style.borderTopWidth) +
          parseFloat(style.borderBottomWidth)
        : 0;

    textarea.style.height = `${clamped + outside}px`;
    textarea.style.overflowY =
      content > maxRows * lineHeight ? 'auto' : 'hidden';
  }, [containerRef, minRows, maxRows]);

  // After every render, for a value set from outside; cheap when unchanged.
  useLayoutEffect(resize);

  useEffect(() => {
    const container = containerRef.current;
    const textarea = container?.querySelector('textarea');
    if (!container || !textarea) {
      return undefined;
    }

    container.addEventListener('input', resize);

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(([entry]) => {
        widthRef.current = entry.contentRect.width;
        resize();
      });
      observer.observe(textarea);
    }

    return () => {
      container.removeEventListener('input', resize);
      observer?.disconnect();
    };
  }, [containerRef, resize]);

  useEffect(
    () => () => {
      mirrorRef.current?.remove();
      mirrorRef.current = null;
    },
    [],
  );
}
