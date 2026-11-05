import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import classNames from 'classnames';
import { CopyButton } from '../CopyButton';
import { PHONE_MEDIA } from '../../utils/breakpoints';

/** Carries the `maxHeight` prop into the stylesheet's phone rule. */
const MAX_HEIGHT_VAR = '--code-block-max-height';

const useStyles = makeStyles(theme => ({
  root: {
    position: 'relative',
    width: '100%',
  },
  codeBlock: {
    margin: 0,
    padding: theme.spacing(1),
    backgroundColor: theme.palette.type === 'dark' ? '#444' : '#f5f5f5',
    color: theme.palette.type === 'dark' ? '#ddd' : '#333',
    borderRadius: 4,
    fontFamily: '"Roboto Mono", monospace',
    fontSize: '0.85em',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  // Extra right padding so long single-line content doesn't run under the copy
  // button — only needed when the button is actually rendered.
  withCopyButton: {
    paddingRight: theme.spacing(5),
  },
  // A capped block scrolls inside itself, so a long log does not stretch the
  // page; lines still wrap, so it never scrolls sideways.
  capped: {
    maxHeight: `var(${MAX_HEIGHT_VAR})`,
    overflowY: 'auto',
    // On a phone a tall cap is most of the view, and a swipe that lands in the
    // block scrolls the block, not the page: two fifths of the view leave room
    // above and below to scroll past it (as the session timeline's blocks).
    [PHONE_MEDIA]: {
      maxHeight: `min(var(${MAX_HEIGHT_VAR}), 40dvh)`,
    },
  },
  copyButton: {
    position: 'absolute',
    top: theme.spacing(0.5),
    right: theme.spacing(0.5),
  },
}));

export type CodeBlockProps = {
  text: string;
  /** Kept for API compatibility; no syntax highlighting is applied today. */
  language?: string;
  copyEnabled?: boolean;
  transparent?: boolean;
  /**
   * Caps the block's height (any CSS length, such as `'400px'`; at most two
   * fifths of the view on a phone); longer text scrolls inside it. Without it
   * the block grows with its text.
   */
  maxHeight?: string;
  /**
   * With `maxHeight`, opens the block scrolled to the end of its text, where a
   * log's error is.
   */
  scrollToEnd?: boolean;
  /**
   * Names the block while it scrolls, when it is a focusable region; prefer
   * `aria-labelledby` pointing at a visible heading.
   */
  'aria-label'?: string;
  /** The id of the visible text that names the block while it scrolls. */
  'aria-labelledby'?: string;
};

/** Whether the element's content is taller than its box, kept up to date. */
function useOverflows(
  ref: RefObject<HTMLElement>,
  enabled: boolean,
  text: string,
): boolean {
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) {
      setOverflows(false);
      return undefined;
    }
    const measure = () =>
      setOverflows(element.scrollHeight > element.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    // A narrower block wraps into more lines; a wider one may stop scrolling.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, enabled, text]);
  return overflows;
}

export const CodeBlock = ({
  text,
  copyEnabled = true,
  transparent = false,
  maxHeight,
  scrollToEnd = false,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: CodeBlockProps) => {
  const classes = useStyles();
  const preRef = useRef<HTMLPreElement>(null);
  const capped = Boolean(maxHeight);
  // Only a block that really scrolls is a region and a tab stop: it is named,
  // and it scrolls from the keyboard (WCAG 2.1.1).
  const scrolls = useOverflows(preRef, capped, text);

  useLayoutEffect(() => {
    const element = preRef.current;
    if (capped && scrollToEnd && element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [capped, scrollToEnd, text]);

  return (
    <div className={classes.root}>
      <pre
        ref={preRef}
        className={classNames(classes.codeBlock, {
          [classes.withCopyButton]: copyEnabled,
          [classes.capped]: capped,
        })}
        style={{
          backgroundColor: transparent ? 'transparent' : undefined,
          ...(maxHeight ? { [MAX_HEIGHT_VAR]: maxHeight } : {}),
        }}
        {...(scrolls
          ? {
              role: 'region',
              tabIndex: 0,
              'aria-label': ariaLabel,
              'aria-labelledby': ariaLabelledBy,
            }
          : {})}
      >
        {text}
      </pre>
      {copyEnabled && (
        <CopyButton text={text} size="compact" className={classes.copyButton} />
      )}
    </div>
  );
};
